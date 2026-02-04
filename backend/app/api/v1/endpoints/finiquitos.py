from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.db.deps import get_db
from app.services.finiquitos_service import FiniquitosService
from app.schemas.finiquitos import (
    FiniquitoCreate, 
    FiniquitoResponse, 
    FiniquitoItemResponse
)

router = APIRouter()

@router.get("/", response_model=List[FiniquitoResponse])
def read_general_finiquitos(db: Session = Depends(get_db)):
    """Obtiene la información de los trabajadores."""
    service = FiniquitosService(db)
    return service.get_trabajadores_general()

@router.get("/{rut}", response_model=List[FiniquitoItemResponse]) 
def read_rut_finiquitos(rut: str, db: Session = Depends(get_db)):
    """Obtiene la información del trabajador."""
    service = FiniquitosService(db)
    return service.get_item_by_rut(rut)

@router.get("/{rut}/variable", response_model=List[FiniquitoItemResponse])
def read_rut_finiquitos_variable(rut: str, variable: str, db: Session = Depends(get_db)):
    """Obtiene la información de remuneración variable de los trabajadores."""
    service = FiniquitosService(db)
    return service.get_item_variable_by_rut(rut, variable)

@router.get("/meses-anteriores", response_model=List[FiniquitoItemResponse])
def read_tres_meses_finiquitos(db: Session = Depends(get_db)):
    """Obtiene los items de los trabajadores de los últimos 5 meses."""
    service = FiniquitosService(db)
    return service.get_items_cinco_meses()

@router.get("/{rut}/descuentos", response_model=List[FiniquitoItemResponse])
def read_descuentos_finiquitos(rut: str, db: Session = Depends(get_db)):
    """Obtiene los descuentos de los trabajadores."""
    service = FiniquitosService(db)
    return service.get_descuentos_finiquitos_by_rut(rut)
