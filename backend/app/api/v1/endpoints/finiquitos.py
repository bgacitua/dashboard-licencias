from calendar import monthrange
from datetime import date
from threading import Lock

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from app.core.config import settings
from app.core.logging_config import logger

from app.db.deps import get_db
from app.core.security import get_current_user
from app.services.finiquitos_service import FiniquitosService
from app.services.desvinculacion_service import (
    DesvinculacionService,
    HITOS,
    enviar_correo_salida,
)
from app.schemas.finiquitos import (
    FiniquitoCreate,
    FiniquitoResponse,
    FiniquitoItemResponse
)
from app.schemas.desvinculacion import (
    CorreoSalidaRequest,
    DesvinculacionUpsert,
    DesvinculacionHito,
    DesvinculacionResponse,
)

router = APIRouter()

# La UF sale del Banco Central, que es la fuente oficial. Se cachea por fecha
# consultada: una vez publicada, la UF de un día no cambia nunca, así que el
# valor sirve mientras viva el proceso. El timeout es corto a propósito: antes
# el navegador le pegaba directo a mindicador.cl y, cuando ese servicio se
# caía, la pantalla de finiquitos quedaba 2 minutos esperando un 502.
_uf_cache: TTLCache = TTLCache(maxsize=8, ttl=6 * 3600)
_uf_lock = Lock()
_UF_TIMEOUT = 8.0
_BCENTRAL_URL = "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx"


def _ultimo_dia_del_mes(hoy: date) -> date:
    """La política liquida siempre contra el último día del mes en curso."""
    return date(hoy.year, hoy.month, monthrange(hoy.year, hoy.month)[1])


def _pedir_uf(dia: date) -> Optional[float]:
    """Valor de la UF para `dia` según el Banco Central. None si no lo publica.

    El Banco Central fija la UF con ~40 días de anticipación, no más: consultada
    a comienzos de mes, la del día 31 todavía puede no existir. Ahí devuelve una
    lista de observaciones vacía, y por eso esto puede retornar None sin que sea
    un error.
    """
    fecha = dia.isoformat()
    resp = httpx.get(
        _BCENTRAL_URL,
        params={
            "token": settings.BCENTRAL_API_TOKEN,
            "function": "GetSeries",
            "timeseries": settings.BCENTRAL_UF_SERIE,
            "firstdate": fecha,
            "lastdate": fecha,
        },
        timeout=_UF_TIMEOUT,
    )
    resp.raise_for_status()
    datos = resp.json()

    if datos.get("Codigo") != 0:
        # Descripcion trae el motivo (token invalido, serie inexistente). No se
        # loguea la URL: lleva el token.
        raise RuntimeError(f"Banco Central respondio: {datos.get('Descripcion')}")

    obs = (datos.get("Series") or {}).get("Obs") or []
    for o in obs:
        if o.get("statusCode") == "OK" and o.get("value"):
            return float(o["value"])
    return None


@router.get("/indicadores/uf")
def get_uf():
    """Valor de la UF del último día del mes en curso, según el Banco Central.

    `valor: null` si no se pudo obtener; el formulario deja escribirla a mano.
    """
    objetivo = _ultimo_dia_del_mes(date.today())
    clave = objetivo.isoformat()

    with _uf_lock:
        if clave in _uf_cache:
            return _uf_cache[clave]

    if not settings.BCENTRAL_API_TOKEN:
        logger.warning("BCENTRAL_API_TOKEN sin configurar: no se puede obtener la UF")
        return {"valor": None, "fecha": None}

    try:
        valor = _pedir_uf(objetivo)
        fecha = objetivo
        if valor is None:
            # Todavía no publicada. Se cae al valor de hoy, que sí existe, y se
            # devuelve su fecha real para que la pantalla no mienta sobre a qué
            # día corresponde el número.
            hoy = date.today()
            valor, fecha = _pedir_uf(hoy), hoy
            logger.info(f"UF de {clave} aun no publicada; se usa la del {hoy.isoformat()}")
    except Exception as e:
        # No se cachea el fallo: el proximo intento tiene que poder recuperarse.
        logger.warning(f"No se pudo obtener la UF del Banco Central: {e}")
        return {"valor": None, "fecha": None}

    if valor is None:
        return {"valor": None, "fecha": None}

    resultado = {"valor": valor, "fecha": fecha.isoformat()}
    with _uf_lock:
        _uf_cache[clave] = resultado
    return resultado


@router.get("/", response_model=List[FiniquitoResponse])
def read_general_finiquitos(db: Session = Depends(get_db)):
    """Obtiene la información de los trabajadores."""
    service = FiniquitosService(db)
    return service.get_trabajadores_general()

# Rutas estáticas ANTES que las paramétricas (evita que /{rut} las capture)
@router.get("/meses-anteriores", response_model=List[FiniquitoItemResponse])
def read_tres_meses_finiquitos(db: Session = Depends(get_db)):
    """Obtiene los items de los trabajadores de los últimos 5 meses."""
    service = FiniquitosService(db)
    return service.get_items_cinco_meses()

# --- Estado del proceso de desvinculación -----------------------------------
# Van antes de /{rut} por claridad; el sufijo las hace inconfundibles de todos modos.

@router.get("/procesos", response_model=List[DesvinculacionResponse])
def read_procesos(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Todos los procesos de desvinculación, para los resúmenes del listado."""
    return DesvinculacionService(db).list_all()


@router.get("/{rut}/proceso", response_model=DesvinculacionResponse)
def read_proceso(
    rut: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Estado guardado del proceso de desvinculación. 404 si aún no se ha iniciado."""
    proceso = DesvinculacionService(db).get_by_rut(rut)
    if not proceso:
        raise HTTPException(status_code=404, detail="Sin proceso registrado para este RUT")
    return proceso


@router.put("/{rut}/proceso", response_model=DesvinculacionResponse)
def upsert_proceso(
    rut: str,
    data: DesvinculacionUpsert,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Guarda el formulario completo. Reemplaza el sessionStorage del frontend."""
    return DesvinculacionService(db).guardar(rut, data, created_by=current_user.username)


@router.post("/{rut}/proceso/hito", response_model=DesvinculacionResponse)
def marcar_hito_proceso(
    rut: str,
    data: DesvinculacionHito,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Sella el timestamp de un hito ('carta' | 'finiquito' | 'correo').
    Sobrescribe si ya existía: se pueden generar varias cartas hasta la definitiva."""
    if data.hito not in HITOS:
        raise HTTPException(
            status_code=400,
            detail=f"Hito inválido. Valores aceptados: {', '.join(HITOS)}",
        )
    proceso = DesvinculacionService(db).marcar_hito(rut, data.hito)
    if not proceso:
        raise HTTPException(
            status_code=404,
            detail="Sin proceso registrado para este RUT; guarda el formulario primero",
        )
    return proceso


@router.post("/{rut}/correo-salida")
def enviar_correo_salida_personal(
    rut: str,
    data: CorreoSalidaRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Envía el aviso de salida de personal y sella el hito 'correo' si hay proceso."""
    from app.services.email_token_service import AuthRequiredError

    try:
        enviado = enviar_correo_salida(rut, data)
    except AuthRequiredError:
        raise HTTPException(
            status_code=401,
            detail="Sin sesión de correo activa. Vuelve a autenticar Microsoft.",
        )
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not enviado:
        raise HTTPException(status_code=502, detail="El correo no pudo enviarse")

    # El aviso puede mandarse sin haber guardado el formulario: si no hay proceso, se crea.
    proceso = DesvinculacionService(db).registrar_correo_salida(
        rut, data, created_by=current_user.username
    )
    return {"enviado": True, "proceso": proceso}


@router.get("/{rut}", response_model=List[FiniquitoItemResponse])
def read_rut_finiquitos(
    rut: str,
    limit: int = Query(15, ge=1, le=60),
    db: Session = Depends(get_db),
):
    """Obtiene la información del trabajador (incluye parámetro `limit`)."""
    service = FiniquitosService(db)
    return service.get_item_by_rut(rut, limit=limit)

@router.get("/{rut}/descuentos", response_model=List[FiniquitoItemResponse])
async def read_descuentos_finiquitos(rut: str, db: Session = Depends(get_db)):
    """Obtiene los descuentos de los trabajadores."""
    service = FiniquitosService(db)
    return await service.get_descuentos_by_rut_finiquito(rut)
