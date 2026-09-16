"""
Interruptor manual de la vigilancia de descuadres de líquidos.

El barrido corre en el scheduler cada pocos minutos, pero solo actúa si la
vigilancia está prendida desde acá. Activar congela el target con los montos
que BUK tiene en ese momento.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.logging_config import logger
from app.core.security import require_role
from app.db.deps import get_db
from app.models.auth import Usuario
from app.services.liquidaciones_service import LiquidacionesError, LiquidacionesService

router = APIRouter()

_ROLES = ["admin", "rrhh"]


@router.get("/vigilancia")
def estado_vigilancia(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role(_ROLES)),
):
    """Estado actual del interruptor."""
    return LiquidacionesService(db).vigilancia_estado()


@router.post("/vigilancia/activar")
async def activar_vigilancia(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role(_ROLES)),
):
    """
    Prende la vigilancia y congela el target. Lee el mes completo desde BUK, así
    que puede tardar más de un minuto.
    """
    try:
        return await LiquidacionesService(db).activar(current_user.username)
    except LiquidacionesError as e:
        logger.error(f"[Liquidos] No se pudo activar la vigilancia: {e}")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.post("/vigilancia/desactivar")
def desactivar_vigilancia(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_role(_ROLES)),
):
    return LiquidacionesService(db).desactivar(current_user.username)
