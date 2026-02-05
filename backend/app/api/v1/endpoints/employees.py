from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.deps import get_db
from app.services.finiquitos_service import FiniquitosService
from app.schemas.finiquitos import VacacionesDisponiblesResponse, EmployeeSueldoResponse

router = APIRouter()

@router.get("/{rut}/vacations-available", response_model=VacacionesDisponiblesResponse)
async def get_vacaciones_disponibles(
    rut: str, 
    date: Optional[str] = Query(None, description="Fecha de proyección en formato YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    """
    Obtiene las vacaciones disponibles de un trabajador desde la API externa de BUK.
    
    Args:
        rut: RUT del trabajador
        date: Fecha opcional para proyección de vacaciones (formato YYYY-MM-DD)
        
    Returns:
        Información de vacaciones disponibles incluyendo total de días
    """
    service = FiniquitosService(db)
    # Limpiar el rut de puntos para la búsqueda
    rut_limpio = rut.replace(".", "").strip()
    try:
        return await service.get_vacaciones_disponibles(rut_limpio, date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{rut}", response_model=EmployeeSueldoResponse)
async def get_sueldo_base(rut: str, db: Session = Depends(get_db)):
    """
    Obtiene el sueldo base de un trabajador desde la API externa de BUK.
    
    Args:
        rut: RUT del trabajador
        
    Returns:
        Información de sueldo base
    """
    service = FiniquitosService(db)
    # Limpiar el rut de puntos para la búsqueda
    rut_limpio = rut.replace(".", "").strip()
    try:
        return await service.get_sueldo_base(rut_limpio)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))