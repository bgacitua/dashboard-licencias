"""Creación de permisos en Buk desde una respuesta de jefatura.

Segunda escritura del módulo, después de las marcas. Mismas reglas: Buk no
tiene ambiente de pruebas, lo que se crea queda en el sistema real y desde acá
no se puede deshacer ni consultar. Por eso `ASISTENCIA_DRY_RUN` arma el payload,
lo loguea y no envía.

El cuerpo sigue el contrato Absences::Permission::Request. Tres cosas de ese
contrato mandan en el diseño:

  - `employee_id` es el id interno de Buk, no el RUT. Sale de `rh.employees.id`,
    que es con lo que ya se cruza `rh.consolidado_incidencias`.
  - `permission_type_id` es numérico y propio del tenant: se configura en
    ASISTENCIA_PERMISO_TIPOS con los ids de "Listar tipos permisos". Solo
    sirven los tipos cuyo cálculo sea en días corridos; los de días hábiles la
    API v1 no los acepta y hay que cargarlos por el formulario individual.
  - `days_count` va en días corridos, así que la unidad no es la fecha sino la
    racha: fechas consecutivas con el mismo motivo son UN permiso de N días, y
    un corte en el calendario abre uno nuevo. Ver `rachas()`.
  - el `kind` del tipo decide la ruta: /absences/permission para los permisos
    y /absences/absence para las ausencias, con el mismo cuerpo. Ver `url_de()`.
"""
from datetime import date, timedelta

import httpx
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging_config import logger

from .config import AsistenciaSettings

# "Olvidó marcar" no es permiso: eso se arregla registrando la marca, que ya
# tiene su propio flujo en Corrección de Marcas.
MOTIVOS_SIN_PERMISO = {"Olvidó marcar"}

# Motivo del formulario -> (permission_type_id, paid), con los tipos del tenant
# ("Listar tipos permisos"):
#     4  permiso_con_goce  "Permiso con goce",       with_pay true
#     3  permiso           "Permiso a descontar",    with_pay false
#     2  ausencia          "Ausencia Injustificada", with_pay false
# `paid` sigue al `with_pay` del tipo: mandar uno que lo contradiga es pedirle
# a Buk un permiso que su propio tipo no admite. Los tres son time_measure
# per_day, que es lo que corresponde a un día sin marcas.
# Si allá cambian, se corrigen con ASISTENCIA_PERMISO_TIPOS sin tocar código.
TIPOS_POR_DEFECTO = {
    "Permiso pagado": (4, True),
    "Permiso sin goce": (3, False),
    "Inasistencia": (2, False),
    # Sin tipo propio: el comentario de la jefatura dice qué es, así que lo
    # elige quien gestiona desde el panel.
    "Otro motivo": (None, False),
}

# El `kind` del tipo decide la ruta: los permisos van a /absences/permission y
# las ausencias a /absences/absence, con el mismo cuerpo. Lo que se elige a
# mano en el panel se manda como permiso, que es lo que ofrece ese campo.
MOTIVOS_DE_AUSENCIA = {"Inasistencia"}


def rachas(fechas_motivo: list[tuple[str, str]]) -> list[list[str]]:
    """[(fecha, motivo)] -> grupos de fechas que van en un mismo permiso.

    Corta cuando el calendario salta o cuando cambia el motivo: `days_count`
    cuenta días corridos, así que un hueco de un día ya es otro permiso. Dos
    fechas separadas por un fin de semana son dos permisos aunque no hubiera
    turno en medio; eso es lo que entiende Buk por días corridos.
    """
    grupos: list[list[str]] = []
    previa: date | None = None
    motivo_previo = None
    for iso, motivo in sorted(fechas_motivo):
        actual = date.fromisoformat(iso)
        if previa and actual == previa + timedelta(days=1) and motivo == motivo_previo:
            grupos[-1].append(iso)
        else:
            grupos.append([iso])
        previa, motivo_previo = actual, motivo
    return grupos


def tipo_buk(motivo: str, settings: AsistenciaSettings) -> int | None:
    """permission_type_id para ese motivo, o None si hay que elegirlo a mano."""
    return settings.permiso_tipos_map.get(motivo) or TIPOS_POR_DEFECTO.get(motivo, (None,))[0]


def url_de(motivo: str, settings: AsistenciaSettings) -> str:
    """Ruta según el kind del tipo: ausencia o permiso."""
    return (
        settings.ausencias_api_url if motivo in MOTIVOS_DE_AUSENCIA
        else settings.permisos_api_url
    ).strip()


def pagado(motivo: str, settings: AsistenciaSettings) -> bool:
    """`paid` del contrato, que acompaña al `with_pay` del tipo usado."""
    return settings.permiso_pagados_map.get(
        motivo, TIPOS_POR_DEFECTO.get(motivo, (None, False))[1]
    )


def employee_id(db: Session, rut: str) -> int | None:
    """rut normalizado (sin puntos ni DV) -> rh.employees.id, que es el
    employee_id de Buk.

    Mismo tratamiento del RUT que `notificaciones.jefaturas_por_rut`: en
    rh.employees viene como xx.xxx.xxx-x y acá se compara el cuerpo pelado.
    """
    return db.execute(
        text("""SELECT id FROM rh.employees
                WHERE ltrim(left(regexp_replace(rut, '[^0-9kK]', '', 'g'), -1), '0') = :rut
                  AND status = 'activo'
                ORDER BY id DESC
                LIMIT 1"""),
        {"rut": rut},
    ).scalar()


def _payload(emp_id: int, fechas: list[str], tipo_id: int, paid: bool, comentario: str) -> dict:
    """Cuerpo del POST, según Absences::Permission::Request.

    Se mandan solo los campos que esta integración conoce. `day_percent` y
    `workday_stage` quedan fuera a propósito: en blanco Buk asume día completo,
    que es lo que significa una inasistencia sin marcas.
    """
    return {
        "employee_id": emp_id,
        "start_date": min(fechas),    # yyyy-mm-dd
        "days_count": len(fechas),    # días corridos: la racha completa
        "paid": paid,
        "permission_type_id": tipo_id,
        "justification": (comentario or "Respuesta de jefatura")[:500],
    }


async def crear(
    rut: str, fechas: list[str], motivo: str, comentario: str,
    settings: AsistenciaSettings, db: Session | None = None, tipo: str = "",
) -> str:
    """Crea UN permiso por la racha `fechas` y devuelve el id que entrega Buk.

    `fechas` tiene que ser una racha consecutiva del mismo motivo: eso lo
    decide `rachas()`, no esta función.

    `tipo` lo manda el panel cuando el motivo no tiene uno configurado
    ("Otro motivo"): es el permission_type_id, numérico.
    """
    if not fechas:
        raise HTTPException(400, "Sin fechas no hay permiso que crear.")

    if motivo in MOTIVOS_SIN_PERMISO:
        raise HTTPException(
            status_code=400,
            detail=f'"{motivo}" no genera permiso: corresponde registrar la marca '
                   "en Corrección de Marcas.",
        )

    if tipo.strip():
        try:
            tipo_id = int(tipo)
        except ValueError:
            raise HTTPException(400, "El tipo de permiso es el id numérico que da Buk.")
    else:
        tipo_id = tipo_buk(motivo, settings)
    if not tipo_id:
        raise HTTPException(
            status_code=400,
            detail=f'Falta el permission_type_id para "{motivo}". Elige uno en el panel '
                   "o configúralo en ASISTENCIA_PERMISO_TIPOS.",
        )

    emp_id = employee_id(db, rut) if db is not None else None
    if not emp_id:
        raise HTTPException(
            status_code=404,
            detail=f"El RUT {rut} no está como activo en rh.employees: sin employee_id "
                   "Buk no puede recibir el permiso.",
        )

    cuerpo = _payload(emp_id, fechas, tipo_id, pagado(motivo, settings), comentario)

    if settings.dry_run:
        logger.warning("[asistencia/permisos] DRY_RUN: permiso NO creado: %s", cuerpo)
        return "dry-run"

    url = url_de(motivo, settings)
    token = (
        settings.permisos_api_key.get_secret_value()
        or settings.buk_api_key.get_secret_value()
    )
    if not url or not token:
        raise HTTPException(
            status_code=503,
            detail="Falta configurar ASISTENCIA_PERMISOS_API_URL y su token: el permiso "
                   "hay que crearlo a mano en Buk por ahora.",
        )

    try:
        async with httpx.AsyncClient(timeout=settings.external_timeout) as cli:
            resp = await cli.post(
                url,
                json=cuerpo,
                headers={settings.buk_api_key_header: token, "Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout al crear el permiso en Buk.")
    except httpx.HTTPStatusError as exc:
        # El detalle real al log, sin el token; al front un mensaje accionable.
        logger.error("[asistencia/permisos] Buk respondió %s: %s",
                     exc.response.status_code, exc.response.text[:500])
        raise HTTPException(
            status_code=502,
            detail=f"Buk rechazó el permiso ({exc.response.status_code}). "
                   "Revisa el log del backend para el detalle.",
        )
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("[asistencia/permisos] fallo al contactar Buk: %r", exc)
        raise HTTPException(status_code=502, detail="No se pudo contactar Buk.")

    # `id` es solo de respuesta según el contrato. Si no viniera, queda
    # constancia igual: la gestión no se pierde por no tener el rastro.
    ref = str(data.get("id") or data.get("data", {}).get("id") or "")
    logger.info("[asistencia/permisos] %s creada para %s desde %s por %d día(s) (ref %s)",
                "ausencia" if motivo in MOTIVOS_DE_AUSENCIA else "permiso",
                rut, min(fechas), len(fechas), ref)
    return ref


def _demo() -> None:
    """python -m app.modules.asistencia.permisos"""
    import asyncio

    cfg = AsistenciaSettings(_env_file=None, dry_run=True)

    class _Db:
        """rh.employees de mentira: resuelve el RUT 1 y ningún otro."""

        def execute(self, *_a, **_k):
            class R:
                def scalar(self_inner):
                    return 7 if _a[1]["rut"] == "1" else None
            return R()

    db = _Db()

    uno = ["2026-01-01"]

    # Olvidó marcar no es permiso: se corta antes de armar nada.
    try:
        asyncio.run(crear("1", uno, "Olvidó marcar", "", cfg, db))
        raise AssertionError("debía rechazar el motivo")
    except HTTPException as exc:
        assert exc.status_code == 400, exc

    # "Otro motivo" no tiene tipo configurado: sin uno elegido a mano, nada sale.
    try:
        asyncio.run(crear("1", uno, "Otro motivo", "mudanza", cfg, db))
        raise AssertionError("debía exigir el tipo")
    except HTTPException as exc:
        assert exc.status_code == 400, exc
    # Y el que se elige a mano es el id numérico, no un nombre.
    try:
        asyncio.run(crear("1", uno, "Otro motivo", "mudanza", cfg, db, tipo="permiso"))
        raise AssertionError("debía exigir un id numérico")
    except HTTPException as exc:
        assert exc.status_code == 400, exc
    assert asyncio.run(crear("1", uno, "Otro motivo", "mudanza", cfg, db, tipo="33")) == "dry-run"

    # Sin employee_id no hay permiso: Buk no recibe RUT.
    try:
        asyncio.run(crear("999", uno, "Permiso pagado", "", cfg, db))
        raise AssertionError("sin employee_id debía cortar")
    except HTTPException as exc:
        assert exc.status_code == 404, exc

    # Con dry_run no sale nada a la red, aunque el motivo sea válido.
    assert asyncio.run(crear("1", uno, "Permiso pagado", "", cfg, db)) == "dry-run"

    # Sin fechas no hay nada que crear.
    try:
        asyncio.run(crear("1", [], "Permiso pagado", "", cfg, db))
        raise AssertionError("sin fechas debía cortar")
    except HTTPException as exc:
        assert exc.status_code == 400, exc

    # Sin URL el permiso no se inventa: 503 y se crea a mano.
    real = AsistenciaSettings(
        _env_file=None, dry_run=False, permisos_api_url="", ausencias_api_url=""
    )
    try:
        asyncio.run(crear("1", uno, "Permiso pagado", "", real, db))
        raise AssertionError("sin endpoint debía cortar")
    except HTTPException as exc:
        assert exc.status_code == 503, exc

    _demo_rachas()

    # Tipos del tenant: con goce 4, a descontar 3, ausencia injustificada 2.
    assert tipo_buk("Permiso pagado", cfg) == 4
    assert tipo_buk("Permiso sin goce", cfg) == 3
    assert tipo_buk("Inasistencia", cfg) == 2
    assert tipo_buk("Otro motivo", cfg) is None, "ese lo elige quien gestiona"
    # Si allá cambian los ids, el .env le gana al default.
    assert tipo_buk("Permiso pagado", AsistenciaSettings(
        _env_file=None, permiso_tipos="Permiso pagado:99")) == 99

    # Cada kind por su ruta: el tipo 2 es kind "ausencia", no "permiso".
    assert url_de("Inasistencia", cfg).endswith("/absences/absence"), url_de("Inasistencia", cfg)
    assert url_de("Permiso pagado", cfg).endswith("/absences/permission")
    assert url_de("Otro motivo", cfg).endswith("/absences/permission"), "el manual va como permiso"

    # `paid` tiene que coincidir con el with_pay del tipo que se manda.
    assert pagado("Permiso pagado", cfg) is True      # id 4, with_pay true
    assert pagado("Permiso sin goce", cfg) is False   # id 3, with_pay false
    assert pagado("Inasistencia", cfg) is False       # id 2, with_pay false
    # Salvo que el .env diga otra cosa para un motivo puntual.
    assert pagado("Otro motivo", AsistenciaSettings(
        _env_file=None, permiso_pagados="Otro motivo:true")) is True

    cuerpo = _payload(7, ["2026-01-02", "2026-01-01"], 4, True, "c" * 900)
    assert cuerpo["days_count"] == 2, "la racha entera va en un permiso"
    assert cuerpo["start_date"] == "2026-01-01", "empieza en la primera fecha"
    assert cuerpo["employee_id"] == 7 and "rut" not in cuerpo, cuerpo
    assert len(cuerpo["justification"]) == 500, "la justificación va acotada"
    # Sin comentario igual viaja algo legible, no una cadena vacía.
    assert _payload(7, ["2026-01-01"], 3, False, "")["justification"] == "Respuesta de jefatura"
    print("ok")


def _demo_rachas() -> None:
    """Días corridos: la racha es la unidad, no la fecha."""
    # Consecutivas con el mismo motivo: un solo permiso.
    assert rachas([("2026-01-01", "p"), ("2026-01-02", "p"), ("2026-01-03", "p")]) == [
        ["2026-01-01", "2026-01-02", "2026-01-03"]
    ]
    # Un hueco corta, aunque el motivo sea el mismo.
    assert rachas([("2026-01-01", "p"), ("2026-01-03", "p")]) == [
        ["2026-01-01"], ["2026-01-03"]
    ]
    # Cambiar de motivo también corta: son tipos de permiso distintos.
    assert rachas([("2026-01-01", "p"), ("2026-01-02", "s")]) == [
        ["2026-01-01"], ["2026-01-02"]
    ]
    # Entra desordenado y sale por fecha.
    assert rachas([("2026-01-02", "p"), ("2026-01-01", "p")]) == [
        ["2026-01-01", "2026-01-02"]
    ]
    # Fin de semana en medio: para Buk son días corridos, así que no corta.
    assert rachas([("2026-01-02", "p"), ("2026-01-03", "p"), ("2026-01-04", "p")]) == [
        ["2026-01-02", "2026-01-03", "2026-01-04"]
    ]
    # Cruce de mes.
    assert rachas([("2026-01-31", "p"), ("2026-02-01", "p")]) == [
        ["2026-01-31", "2026-02-01"]
    ]
    assert rachas([]) == []


if __name__ == "__main__":
    _demo()
