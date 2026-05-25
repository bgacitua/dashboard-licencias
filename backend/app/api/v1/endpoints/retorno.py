from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.deps import get_db, get_marcas_db
from app.services.retorno_service import RetornoService
from app.core.security import require_role
from app.core.logging_config import logger

router = APIRouter()


@router.get("/seguimiento")
def get_seguimiento_retorno(
    dias: int = 7,
    db: Session = Depends(get_db),
    marcas_db: Session = Depends(get_marcas_db),
):
    """
    Retorna empleados cuya licencia venció en los últimos N días
    que no tienen licencia activa hoy, con estado de marcaje desde retorno esperado.
    """
    try:
        service = RetornoService(db, marcas_db)
        return service.get_seguimiento(dias_atras=dias)
    except Exception as e:
        logger.error(f"Error en seguimiento de retorno: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener seguimiento de retorno")


@router.post("/enviar-alerta")
def enviar_alerta_retorno(
    recipient_email: str,
    dias: int = 7,
    db: Session = Depends(get_db),
    marcas_db: Session = Depends(get_marcas_db),
    current_user=Depends(require_role(["admin", "rrhh"])),
):
    """
    Envía email de seguimiento de retorno vía Microsoft Graph API.
    """
    try:
        service = RetornoService(db, marcas_db)
        result = service.enviar_alerta_retorno(recipient_email=recipient_email, dias_atras=dias)
        if result.get("auth_required"):
            raise HTTPException(status_code=401, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enviando alerta de retorno: {e}")
        raise HTTPException(status_code=500, detail="Error al enviar alerta de retorno")
