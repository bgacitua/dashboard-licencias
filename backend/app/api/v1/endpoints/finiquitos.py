from threading import Lock

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any

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

# La UF cambia una vez al día: se guarda una hora y de ahí sale servida al
# instante. El timeout es corto a propósito. Antes el navegador le pegaba
# directo a mindicador.cl y, cuando ese servicio se caía, la pantalla de
# finiquitos quedaba 2 minutos esperando antes de fallar con 502.
_uf_cache: TTLCache = TTLCache(maxsize=1, ttl=3600)
_uf_lock = Lock()
_UF_TIMEOUT = 5.0


@router.get("/indicadores/uf")
def get_uf():
    """Valor de la UF de hoy. `valor: null` si no se pudo obtener.

    Se sirve desde el backend y no desde el navegador para poder cachearlo,
    acotar el timeout, y no exponer al usuario a un tercero.
    """
    with _uf_lock:
        if "uf" in _uf_cache:
            return _uf_cache["uf"]

    try:
        resp = httpx.get("https://mindicador.cl/api/uf", timeout=_UF_TIMEOUT)
        resp.raise_for_status()
        serie = resp.json().get("serie") or []
        if not serie:
            raise ValueError("respuesta sin serie")
        valor = {"valor": serie[0]["valor"], "fecha": serie[0].get("fecha")}
    except Exception as e:
        # Sin valor, el frontend deja que se escriba a mano. No se cachea el
        # fallo: el proximo intento tiene que poder recuperarse enseguida.
        logger.warning(f"No se pudo obtener la UF: {e}")
        return {"valor": None, "fecha": None}

    with _uf_lock:
        _uf_cache["uf"] = valor
    return valor


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
