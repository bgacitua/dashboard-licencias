"""Listado vigente de recinto por trabajador — filtro global de validación de RUTs.

Fuente preferida: API core de Buk (employees), campo
custom_attributes.current_job.recinto_asistencia. Se actualiza antes que
getAsignacionTurnos, que queda como fallback si BUK_API_URL no está configurada.

Todos los reportes que cruzan RUTs (Marcajes, Inasistencias, Auditoría) filtran contra
este mapa para descartar trabajadores que no pertenecen al recinto consultado.

Fail-open en todos lados: si el endpoint falla, el mapa queda vacío y no se filtra nada.
Preferimos mostrar filas de más antes que ocultar datos por una caída de la fuente.
"""
import asyncio
import re
import time
from datetime import date

import httpx
from fastapi import HTTPException

from app.core.logging_config import logger

from .client import ExternalClient, to_buk_date
from .config import AsistenciaSettings


# Campos donde puede venir el RUT según el reporte: Inasistencias/Auditoría usan DNI,
# Marcajes usa rut_trabajador, asignación de turnos usa dni.
RUT_FIELDS = ("DNI", "dni", "rut_trabajador")


def clean_rut(value: object) -> str:
    """RUT comparable entre fuentes (dni viene con puntos/guión)."""
    return re.sub(r"[^0-9kK]", "", str(value or "")).lower()


def recinto_actual(asignaciones: list[dict]) -> dict[str, str]:
    """rut_limpio -> idRecinto vigente.

    ponytail: primera ocurrencia por dni = la más reciente (la API devuelve
    los más nuevos primero), misma regla que el tab "Recinto por trabajador".
    """
    out: dict[str, str] = {}
    for a in asignaciones:
        rut = clean_rut(a.get("dni"))
        recinto = str(a.get("idRecinto") or "").strip()
        if rut and recinto:
            out.setdefault(rut, recinto)
    return out


def _code_recinto(emp: dict) -> str:
    """current_job.recinto_asistencia -> code (str).

    Buk lo devuelve como objeto {id, code}, pero según cómo esté definido el
    atributo puede venir como string plano o con value/name; aceptamos todos.
    """
    job = emp.get("current_job") or {}
    val = job.get("recinto_asistencia")
    if val is None:  # respaldo: algunas cuentas lo exponen bajo custom_attributes
        val = ((emp.get("custom_attributes") or {}).get("current_job") or {}).get("recinto_asistencia")
    if isinstance(val, dict):
        val = val.get("code") or val.get("value") or val.get("name")
    return str(val or "").strip()


def recinto_desde_employees(employees: list[dict], codes: dict[str, str]) -> dict[str, str]:
    """rut_limpio -> obra_id, traduciendo el code del custom attribute.

    Los códigos sin entrada en RECINTO_CODES se omiten: filtrar por un id que no
    corresponde a ninguna obra descartaría filas válidas.
    """
    out: dict[str, str] = {}
    for emp in employees:
        rut = clean_rut(emp.get("rut"))
        obra = codes.get(_code_recinto(emp).lower())
        if rut and obra:
            out[rut] = obra
    return out


async def fetch_employees(client: ExternalClient, settings: AsistenciaSettings) -> list[dict]:
    """Empleados de la API core de Buk (cacheados por ExternalClient).

    El filtro de vigentes lo hace la URL (.../employees/active), no un query param.
    """
    logger.info("[recintos] consultando %s…", settings.buk_api_url)
    return await client.get_paged_next(
        settings.buk_api_url,
        {},
        headers={settings.buk_api_key_header: settings.buk_api_key.get_secret_value()},
    )


def _rut_de(row: dict, campos: tuple[str, ...]) -> str:
    for c in campos:
        if row.get(c) not in (None, ""):
            return clean_rut(row[c])
    return ""


def filtrar_por_obra(
    rows: list[dict],
    mapa: dict[str, str],
    obra_id: str | None,
    campos: tuple[str, ...] = RUT_FIELDS,
) -> tuple[list[dict], int]:
    """Deja solo las filas cuyo RUT esté asignado hoy a `obra_id`.

    Devuelve (filas_conservadas, nº_descartadas). Fail-open: sin mapa o sin
    obra_id no se filtra nada.
    """
    if not mapa or not obra_id:
        return rows, 0
    obra = str(obra_id).strip()
    keep = [r for r in rows if mapa.get(_rut_de(r, campos)) == obra]
    return keep, len(rows) - len(keep)


class RecintoDirectory:
    """Mapa rut -> recinto vigente, cacheado en memoria con TTL.

    ExternalClient.get_array no cachea (es un GET simple sin paginación), así que
    la caché vive aquí: el filtro se aplica en cada request de cada reporte.
    """

    def __init__(self, client: ExternalClient, settings: AsistenciaSettings) -> None:
        self._client = client
        self._settings = settings
        self._cached: tuple[float, dict[str, str]] | None = None
        self._lock = asyncio.Lock()

    async def mapa(self) -> dict[str, str]:
        """rut_limpio -> obra_id vigente. {} si la fuente falla."""
        ttl = self._settings.cache_ttl
        cached = self._cached
        if cached and time.monotonic() - cached[0] < ttl:
            return cached[1]

        async with self._lock:
            cached = self._cached  # re-check tras el lock (evita cache stampede)
            if cached and time.monotonic() - cached[0] < ttl:
                return cached[1]
            try:
                mapa = await self._fetch_mapa()
            except (httpx.HTTPError, HTTPException) as exc:
                logger.warning("[recintos] fuente falló, sin filtro de recinto: %r", exc)
                return {}
            self._cached = (time.monotonic(), mapa)
            return mapa

    async def _fetch_mapa(self) -> dict[str, str]:
        s = self._settings
        if s.buk_api_url:
            employees = await fetch_employees(self._client, s)
            mapa = recinto_desde_employees(employees, s.recinto_codes_map)
            logger.info("[recintos] employees: %d con recinto de %d", len(mapa), len(employees))
            return mapa
        # Fallback: BUK_API_URL sin configurar => asignación de turnos de hoy.
        hoy = to_buk_date(date.today().isoformat())
        asignaciones = await self._client.get_array(
            s.asignacion_turnos_api_url,
            {"token": s.external_api_key.get_secret_value(), "desde": hoy, "hasta": hoy},
        )
        return recinto_actual(asignaciones)

    def invalidate(self) -> None:
        self._cached = None
        if self._settings.buk_api_url:
            self._client.invalidate(self._settings.buk_api_url)


def _nombre_area(emp: dict) -> tuple[str, str]:
    """(nombre, área) de un empleado de la API core, tolerante al shape."""
    job = emp.get("current_job") or {}
    area = job.get("area") or emp.get("area") or job.get("area_id") or ""
    if isinstance(area, dict):
        area = area.get("name") or area.get("first_level_name") or ""
    nombre = emp.get("full_name") or f"{emp.get('first_name', '')} {emp.get('surname', '')}".strip()
    return str(nombre), str(area)


def filas_recinto_trabajador(employees: list[dict], codes: dict[str, str]) -> list[dict]:
    """Filas del tab "Recinto por trabajador" (mismas keys que getAsignacionTurnos)."""
    filas = []
    for emp in employees:
        code = _code_recinto(emp)
        if not code:
            continue
        nombre, area = _nombre_area(emp)
        filas.append({
            "nombreTrabajador": nombre,
            "dni": emp.get("rut") or "",
            "codigoRecinto": code,
            "idRecinto": codes.get(code.lower(), ""),
            "areaTrabajador": area,
        })
    return filas


def _demo() -> None:
    """python -m app.shared.recintos — check del filtro por obra."""
    mapa = recinto_actual([
        {"dni": "12.006.327-8", "idRecinto": "36787"},
        {"dni": "12.006.327-8", "idRecinto": "36790"},  # asignación vieja, se ignora
        {"dni": "11111111-1", "idRecinto": "36790"},
    ])
    assert mapa == {"120063278": "36787", "111111111": "36790"}, mapa

    rows = [
        {"DNI": "12006327-8"},        # recinto 36787 -> se conserva
        {"DNI": "11.111.111-1"},      # recinto 36790 -> se descarta
        {"DNI": "99999999-9"},        # sin asignación -> se descarta
        {"rut_trabajador": "12006327-8"},  # otro campo de RUT -> se conserva
        {},                           # sin RUT -> se descarta
    ]
    keep, descartados = filtrar_por_obra(rows, mapa, "36787")
    assert len(keep) == 2, keep
    assert descartados == 3, descartados

    # fail-open: mapa vacío o sin obra => nada se filtra
    assert filtrar_por_obra(rows, {}, "36787") == (rows, 0)
    assert filtrar_por_obra(rows, mapa, None) == (rows, 0)

    # --- fuente API core: custom_attributes.current_job.recinto_asistencia ---
    codes = {"cramer": "36787", "app": "42123"}
    employees = [
        {"rut": "12.006.327-8", "full_name": "Ana Pérez",
         "current_job": {"area": {"name": "Bodega"},
                         "recinto_asistencia": {"id": 1, "code": "CRAMER"}}},
        {"rut": "11111111-1", "first_name": "Luis", "surname": "Soto",
         # respaldo: el atributo bajo custom_attributes
         "custom_attributes": {"current_job": {"recinto_asistencia": "app"}}},
        {"rut": "22222222-2",  # code sin mapear -> fuera del mapa de filtro
         "current_job": {"recinto_asistencia": {"code": "DESCONOCIDO"}}},
        {"rut": "33333333-3", "current_job": {"recinto_asistencia": None}},  # sin recinto -> ignorado
    ]
    assert recinto_desde_employees(employees, codes) == {
        "120063278": "36787", "111111111": "42123",
    }, recinto_desde_employees(employees, codes)

    filas = filas_recinto_trabajador(employees, codes)
    assert len(filas) == 3, filas  # los 3 con code (incl. el no mapeado)
    assert filas[0] == {
        "nombreTrabajador": "Ana Pérez", "dni": "12.006.327-8",
        "codigoRecinto": "CRAMER", "idRecinto": "36787", "areaTrabajador": "Bodega",
    }, filas[0]
    assert filas[1]["nombreTrabajador"] == "Luis Soto", filas[1]
    assert filas[2]["idRecinto"] == "", filas[2]  # code sin RECINTO_CODES
    print("ok")


if __name__ == "__main__":
    _demo()
