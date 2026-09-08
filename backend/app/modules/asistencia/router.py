"""Router del módulo de asistencia — solo lecturas por ahora.

Contrato con la plataforma — este módulo importa exactamente tres cosas de
fuera de su carpeta, y nada más:

    app.core.security.require_module   -> autorización
    app.core.security.require_role     -> restringe la escritura de marcas
    app.db.deps.get_db                 -> sesión PostgreSQL (reportes)
    app.db.deps.get_marcas_db          -> sesión SQL Server del reloj Morpho
    app.core.logging_config.logger     -> logs
    app.services.email_service         -> aviso a jefatura
    app.services.email_token_service   -> saber si hay sesión de Microsoft
    app.core.config.settings          -> PUBLIC_URL y credenciales de Buk core

Cualquier import adicional hacia `app.*` es acoplamiento: revisarlo antes de
agregarlo.
"""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.logging_config import logger
from app.core.security import require_module, require_role
from app.db.deps import get_db, get_marcas_db

from .client import to_buk_date
from .columnas import columnas_crudas, ordered_columns
from .config import AsistenciaSettings, get_settings
from . import historial, notificaciones
from .marcas import registrar
from .morpho import marcas_en_rango
from .plataforma import buk_core_url
from .hhee.repository import HheeRepo
from .hhee.schemas import Frescura, SyncResponse
from .hhee import service as hhee_service
from .reportes.repository import ReportesRepo
from .reportes.schemas import ReporteRequest
from .reportes.service import ReportService
from .recintos import fetch_employees, filas_recinto_trabajador, filtrar_por_obra
from .schemas import (
    DataResponse,
    OperacionCreate,
    RegistrarRequest,
    RegistrarResponse,
    RegistroUpdate,
)
from .service import (
    exigir_configurado,
    get_client,
    get_marcajes,
    get_por_obra,
    get_recintos,
)

# require_module("asistencia") exige la fila en app.modulos y su asignación al
# rol. Aplicado a nivel de router: ningún endpoint del módulo queda expuesto
# por olvido.
router = APIRouter(dependencies=[Depends(require_module("asistencia"))])

Settings = Annotated[AsistenciaSettings, Depends(get_settings)]
MarcasDb = Annotated[Session, Depends(get_marcas_db)]
Db = Annotated[Session, Depends(get_db)]


@router.get("/health")
def health(settings: Settings) -> dict:
    """Estado del módulo y de sus dependencias externas."""
    return {
        "modulo": "asistencia",
        "dry_run": settings.dry_run,
        "ctrl_configurado": bool(settings.external_api_key.get_secret_value()),
        "buk_core_configurado": bool(buk_core_url(settings)),
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
        rows = await get_por_obra(getattr(settings, url_attr), params, obra_id, settings)
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
    la API core configurada cae al endpoint de asignación de turnos de hoy.
    """
    exigir_configurado(settings)
    if not buk_core_url(settings):
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


# === Reportes: bono de asistencia ===
# POST porque el reporte de atrasos llega en el cuerpo: lo parsea el frontend
# (xls/xlsx/csv) y viaja como filas, así el backend no lee binarios. Son
# lecturas: no escriben nada, ni en la plataforma ni en Buk.


def _servicio_reportes(db: Db, settings: Settings) -> ReportService:
    return ReportService(ReportesRepo(db), settings, buk=get_client())


def _exigir_atrasos(req: ReporteRequest) -> None:
    """Sin reporte de atrasos, Atrasos queda en 0 y los bonos salen inflados:
    mejor 400 que un reporte silenciosamente incorrecto."""
    if not req.atrasos:
        raise HTTPException(status_code=400, detail="Falta el reporte de atrasos.")


@router.post("/reportes/bono", response_model=DataResponse)
async def reporte_bono(
    req: ReporteRequest,
    servicio: Annotated[ReportService, Depends(_servicio_reportes)],
) -> DataResponse:
    _exigir_atrasos(req)
    try:
        rows = await servicio.generar(req, atrasos_rows=req.atrasos)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return DataResponse(rows=rows, total=len(rows), columns=ReportService.columnas(rows))


@router.post("/reportes/bono/hojas")
async def reporte_bono_hojas(
    req: ReporteRequest,
    servicio: Annotated[ReportService, Depends(_servicio_reportes)],
) -> list[dict]:
    """Reporte + hojas de auditoría. El .xlsx lo arma el frontend con estas filas."""
    _exigir_atrasos(req)
    try:
        hojas = await servicio.generar_sheets(req, atrasos_rows=req.atrasos)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return [{"nombre": n, "rows": rows, "columns": cols} for n, rows, cols in hojas]


# === Registro de marcas ===
# Única escritura del módulo, y va a un sistema sin ambiente de pruebas ni
# rollback: además del módulo se exige rol admin, y ASISTENCIA_DRY_RUN=true
# (el default) hace que el payload quede en el log en vez de enviarse.


@router.post(
    "/marcas",
    response_model=RegistrarResponse,
    dependencies=[Depends(require_role(["admin"]))],
)
async def registrar_marcas(
    req: RegistrarRequest, settings: Settings, db: Db
) -> RegistrarResponse:
    return await registrar(req.obra_id, req.marcas, settings, db=db, op_id=req.op_id)


# === Historial y operaciones de corrección ===
# Lecturas y escrituras locales: no tocan Buk. Guardan qué se envió (Buk no deja
# consultarlo) y permiten retomar una corrección a medias sin volver a subir los
# archivos.


@router.get("/historial")
def ver_historial(
    db: Db,
    desde: str | None = Query(None, description="yyyy-mm-dd"),
    hasta: str | None = Query(None, description="yyyy-mm-dd"),
) -> list[dict]:
    return historial.consultar(db, desde, hasta)


@router.get("/operaciones")
def listar_operaciones(db: Db, obra_id: str | None = Query(None)) -> list[dict]:
    return historial.listar_operaciones(db, obra_id)


@router.get("/operaciones/{op_id}")
def obtener_operacion(op_id: int, db: Db) -> dict:
    op = historial.obtener_operacion(db, op_id)
    if op is None:
        raise HTTPException(status_code=404, detail="La operación no existe.")
    return op


@router.post("/operaciones", status_code=201)
def crear_operacion(body: OperacionCreate, db: Db) -> dict:
    op_id = historial.crear_operacion(
        db, body.obra_id, body.desde, body.hasta, body.label,
        [r.model_dump() for r in body.registros],
    )
    return historial.obtener_operacion(db, op_id)


@router.delete("/operaciones/{op_id}", status_code=204)
def eliminar_operacion(op_id: int, db: Db) -> None:
    historial.eliminar_operacion(db, op_id)


@router.patch("/operaciones/{op_id}/registros", status_code=204)
def actualizar_registros(op_id: int, updates: list[RegistroUpdate], db: Db) -> None:
    historial.actualizar_registros(db, op_id, [u.model_dump() for u in updates])


# === Aviso a jefatura ===


@router.post("/notificar-jefatura", response_model=notificaciones.NotificarResponse)
async def notificar_jefatura(
    req: notificaciones.NotificarRequest, db: Db, settings: Settings
) -> notificaciones.NotificarResponse:
    """Un correo por trabajador, con todas sus fechas y un link para responder.

    Manda correo de verdad. EMAIL_TEST_REDIRECT en el .env de la plataforma
    desvía todo a una casilla de prueba.
    """
    return await notificaciones.notificar(req, db, settings)


@router.get("/jefaturas")
def jefaturas(db: Db, ruts: str = Query(..., description="RUTs sin DV, separados por coma")) -> dict:
    """Correo del jefe directo de cada RUT, para no escribirlo a mano."""
    return notificaciones.jefaturas_por_rut(db, [r.strip() for r in ruts.split(",")])


@router.get("/respuestas-jefatura")
def respuestas_jefatura(db: Db, desde: str = Query(...), hasta: str = Query(...)) -> dict:
    """Motivos ya respondidos y avisos ya enviados, para pintar la columna."""
    return {
        "respuestas": notificaciones.respuestas_por_clave(db, desde, hasta),
        "notificadas": notificaciones.notificadas_por_clave(db, desde, hasta),
    }


# === Horas extras (submodulo hhee) ===
# Las filas las escribe el contenedor hhee-scrapping (repo
# scrapping-hhee-reportes) en app.hhee_alertas, lunes a viernes 08:00 sobre la
# semana ISO anterior. Aca solo se lee: si Buk o ese servicio se caen, la
# pantalla sigue viva con el ultimo dato y `ultima_vez` delata la antiguedad.
# Topes vigentes: 2 h diarias de lunes a viernes, y 12 h semanales (el fin de
# semana solo esta acotado por el tope semanal).


HHEE_COLUMNAS = [
    "recinto", "rut", "nombre", "cargo", "centro_costo", "tipo", "clave_periodo",
    "horas", "tope", "exceso", "veces_vista", "primera_vez", "ultima_vez",
]


@router.get("/hhee/alertas", response_model=DataResponse)
def hhee_alertas(
    db: Db,
    recinto: str | None = Query(None, description="id_recinto; vacio = todos"),
    tipo: str | None = Query(None, description="'diario' o 'semanal'"),
    rut: str | None = None,
    anio_iso: int | None = Query(None, description="anio ISO; default: semana anterior"),
    semana_iso: int | None = Query(None, ge=1, le=53, description="semana ISO"),
    desde: str | None = Query(None, description="clave_periodo minima; usar solo junto a `tipo`"),
    hasta: str | None = Query(None, description="clave_periodo maxima; usar solo junto a `tipo`"),
    limite: int = Query(2000, ge=1, le=10000),
) -> DataResponse:
    """Alertas de HHEE sobre el tope. Sin filtro de fecha, la semana ISO anterior."""
    if tipo and tipo not in ("diario", "semanal"):
        raise HTTPException(status_code=422, detail="tipo debe ser 'diario' o 'semanal'.")
    # clave_periodo mezcla dos formatos ('2026-09-02' y '2026-W36'), asi que un
    # rango sobre ella solo es interpretable dentro de un mismo tipo.
    if (desde or hasta) and not tipo:
        raise HTTPException(
            status_code=422,
            detail="`desde`/`hasta` exigen `tipo`: las claves diarias y semanales "
                   "no son comparables entre si. Para una semana completa usar "
                   "`anio_iso` + `semana_iso`.",
        )
    if not any((anio_iso, semana_iso, desde, hasta)):
        anio_iso, semana_iso = hhee_service.semana_iso_por_defecto()
    try:
        rows = HheeRepo(db).alertas(recinto=recinto, tipo=tipo, rut=rut,
                                    anio_iso=anio_iso, semana_iso=semana_iso,
                                    desde=desde, hasta=hasta, limite=limite)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return DataResponse(rows=rows, total=len(rows), columns=HHEE_COLUMNAS)


@router.get("/hhee/semanas")
def hhee_semanas(db: Db) -> list[dict]:
    """Semanas ISO con alertas, para el selector. Sin adivinar rangos en el front."""
    try:
        return HheeRepo(db).semanas()
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/hhee/frescura", response_model=list[Frescura])
def hhee_frescura(db: Db) -> list[dict]:
    """Ultima corrida del scraper por recinto. Alimenta el "actualizado hace X"."""
    try:
        return HheeRepo(db).frescura()
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/hhee/historial", response_model=DataResponse)
def hhee_historial(
    settings: Settings,
    desde: date = Query(..., description="inicio del periodo (YYYY-MM-DD)"),
    hasta: date = Query(..., description="fin del periodo (YYYY-MM-DD)"),
    recinto: str = Query("", description="id_recinto; vacio = el default del scraper"),
    rut: str = Query("", description="filtra un trabajador"),
) -> DataResponse:
    """Horas extras aprobadas en el periodo, una fila por cambio de estado.

    Va a Buk en vivo a traves del scraper: es lo mas lento del modulo (un
    request por registro del listado) y por eso solo corre cuando alguien lo
    pide explicitamente, nunca al abrir la pantalla.
    """
    if desde > hasta:
        raise HTTPException(status_code=422, detail="'desde' es posterior a 'hasta'.")
    try:
        r = hhee_service.historial(settings, desde=desde, hasta=hasta,
                                   recinto=recinto, rut=rut)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    rows = r.get("rows", [])
    return DataResponse(rows=rows, total=len(rows), columns=r.get("columns", []))


@router.post("/hhee/refrescar", response_model=SyncResponse)
def hhee_refrescar(
    settings: Settings,
    desde: date | None = Query(None, description="default: lunes de la semana pasada"),
    hasta: date | None = Query(None, description="default: domingo de la semana pasada"),
    recintos: str = Query("", description="ids separados por coma; vacio = los configurados"),
) -> dict:
    """Dispara el barrido del scraper ahora. Lo unico de este submodulo que sale a la red.

    La API key se manda desde aca, nunca desde el navegador. Tarda ~12 s por
    recinto. Responde 200 aunque algun recinto falle: el detalle va en `recintos`.
    """
    try:
        return hhee_service.refrescar(settings, desde=desde, hasta=hasta, recintos=recintos)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
