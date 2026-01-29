from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.deps import get_db
from app.services.finiquitos_service import FiniquitosService
from app.schemas.finiquitos import VacacionesDisponiblesResponse

router = APIRouter()

@router.get("/{rut}/vacations-available", response_model=VacacionesDisponiblesResponse)
async def get_vacaciones_disponibles(rut: str, db: Session = Depends(get_db)):
    """
    Obtiene las vacaciones disponibles de un trabajador desde la API externa de BUK.
    
    Args:
        rut: RUT del trabajador
        
    Returns:
        Información de vacaciones disponibles incluyendo total de días
    """
    service = FiniquitosService(db)
    try:
        return await service.get_vacaciones_disponibles(rut)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
