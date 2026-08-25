"""Router del módulo de asistencia — solo lecturas por ahora.

Contrato con la plataforma — este módulo importa exactamente tres cosas de
fuera de su carpeta, y nada más:

    app.core.security.require_module   -> autorización
    app.db.deps.get_db                 -> sesión SQLAlchemy (aún sin usar)
    app.db.deps.get_marcas_db          -> sesión SQL Server del reloj Morpho
    app.core.logging_config.logger     -> logs

Cualquier import adicional hacia `app.*` es acoplamiento: revisarlo antes de
agregarlo.
"""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.logging_config import logger
from app.core.security import require_module
from app.db.deps import get_marcas_db

from .client import to_buk_date
from .columnas import columnas_crudas, ordered_columns
from .config import AsistenciaSettings, get_settings
from .morpho import marcas_en_rango
from .recintos import fetch_employees, filas_recinto_trabajador, filtrar_por_obra
from .schemas import DataResponse
from .service import exigir_configurado, get_client, get_marcajes, get_recintos

# require_module("asistencia") exige la fila en app.modulos y su asignación al
# rol. Aplicado a nivel de router: ningún endpoint del módulo queda expuesto
# por olvido.
router = APIRouter(dependencies=[Depends(require_module("asistencia"))])

Settings = Annotated[AsistenciaSettings, Depends(get_settings)]
MarcasDb = Annotated[Session, Depends(get_marcas_db)]


@router.get("/health")
def health(settings: Settings) -> dict:
    """Estado del módulo y de sus dependencias externas."""
    return {
        "modulo": "asistencia",
        "dry_run": settings.dry_run,
        "ctrl_configurado": bool(settings.external_api_key.get_secret_value()),
        "buk_core_configurado": bool(settings.buk_api_url),
        "obras": len(settings.obras_list),
    }


@router.get("/obras")
def obras(settings: Settings) -> list[dict]:
    """Opciones del selector de obra. Alimenta el filtro global."""
    return settings.obras_list


@router.get("/marcajes", response_model=DataResponse)
async def marcajes(
    desde: str | None = Query(None, description="yyyy-mm-dd"),
    hasta: str | None = Query(None, description="yyyy-mm-dd"),
    obra_id: str | None = Query(None),
) -> DataResponse:
    rows, descartados = await get_marcajes(desde, hasta, obra_id)
    return DataResponse(
        rows=rows, total=len(rows), columns=ordered_columns(rows), descartados=descartados
    )


def _rango_params(desde: str | None, hasta: str | None) -> dict:
    params: dict[str, object] = {}
    if (d := to_buk_date(desde)):
        params["from"] = d
    if (h := to_buk_date(hasta)):
        params["to"] = h
    return params


def _endpoint_por_obra(nombre: str, url_attr: str):
    """Auditoría e inasistencias comparten forma: crawl paginado + filtro de obra."""

    async def handler(
        settings: Settings,
        desde: str | None = Query(None),
        hasta: str | None = Query(None),
        obra_id: str | None = Query(None),
    ) -> DataResponse:
        exigir_configurado(settings)
        params = _rango_params(desde, hasta)
        if obra_id:
            params["obra_id"] = obra_id
        rows = await get_client().get_paged(getattr(settings, url_attr), params)
        # Las columnas se calculan antes de filtrar: si no queda ninguna fila,
        # la tabla del frontend igual sabe qué encabezados dibujar.
        cols = columnas_crudas(rows)
        rows, descartados = filtrar_por_obra(rows, await get_recintos().mapa(), obra_id)
        if descartados:
            logger.info("[asistencia/%s] obra=%s: %d filas fuera del recinto",
                        nombre, obra_id, descartados)
        return DataResponse(rows=rows, total=len(rows), columns=cols, descartados=descartados)

    handler.__name__ = nombre
    return handler


router.get("/auditoria", response_model=DataResponse)(
    _endpoint_por_obra("auditoria", "auditoria_api_url")
)
router.get("/inasistencias", response_model=DataResponse)(
    _endpoint_por_obra("inasistencias", "inasistencias_api_url")
)


@router.get("/asignacion-turnos", response_model=DataResponse)
async def asignacion_turnos(
    settings: Settings,
    desde: str | None = Query(None),
    hasta: str | None = Query(None),
) -> DataResponse:
    exigir_configurado(settings)
    # Este endpoint espera el token como query param, no como header.
    params: dict[str, object] = {"token": settings.external_api_key.get_secret_value()}
    if (d := to_buk_date(desde)):
        params["desde"] = d
    if (h := to_buk_date(hasta)):
        params["hasta"] = h
    rows = await get_client().get_array(settings.asignacion_turnos_api_url, params)
    return DataResponse(rows=rows, total=len(rows), columns=columnas_crudas(rows))


@router.get("/recinto-trabajador", response_model=DataResponse)
async def recinto_trabajador(settings: Settings) -> DataResponse:
    """Recinto vigente por trabajador desde la API core de Buk.

    Misma fuente que alimenta el filtro global de los demás tabs. Sin
    buk_api_url cae al endpoint de asignación de turnos de hoy.
    """
    exigir_configurado(settings)
    if not settings.buk_api_url:
        hoy = date.today().isoformat()
        return await asignacion_turnos(settings, hoy, hoy)
    employees = await fetch_employees(get_client(), settings)
    rows = filas_recinto_trabajador(employees, settings.recinto_codes_map)
    sin_mapeo = {r["codigoRecinto"] for r in rows if not r["idRecinto"]}
    if sin_mapeo:
        logger.warning("[asistencia/recinto-trabajador] codes sin ASISTENCIA_RECINTO_CODES: %s",
                       sorted(sin_mapeo))
    return DataResponse(rows=rows, total=len(rows), columns=columnas_crudas(rows))


@router.get("/morpho-marcas")
def morpho_marcas(
    db: MarcasDb,
    desde: str = Query(..., description="yyyy-mm-dd"),
    hasta: str = Query(..., description="yyyy-mm-dd"),
) -> dict:
    """Claves `rut|fecha` con marca en el reloj biométrico, para cruzar Inasistencias.

    Devuelve el set completo del rango en vez de resolver fila por fila: son
    pocas decenas de miles de claves y evita una consulta por inasistencia.
    """
    claves = marcas_en_rango(db, desde, hasta)
    return {"busquedas": sorted(claves), "total": len(claves)}
