from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.db.deps import get_db
from app.services.finiquitos_service import FiniquitosService
from app.schemas.finiquitos import FiniquitoCreate, FiniquitoResponse

router = APIRouter()

@router.get("/", response_model=List[FiniquitoResponse])
def read_general_finiquitos(db: Session = Depends(get_db)):
    """Obtiene la información de los trabajadores."""
    service = FiniquitosService(db)
    return service.get_trabajadores_general()

@router.get("/items", response_model=List[Dict[str, Any]])
def read_items_finiquitos(db: Session = Depends(get_db)):
    """Obtiene los items de los trabajadores."""
    service = FiniquitosService(db)
    return service.get_trabajadores_items()

@router.get("/meses-anteriores", response_model=List[Dict[str, Any]])
def read_tres_meses_finiquitos(db: Session = Depends(get_db)):
    """Obtiene los items de los trabajadores de los últimos 3 meses."""
    service = FiniquitosService(db)
    return service.get_items_tres_meses()

@router.get("/{rut}", response_model=List[FiniquitoResponse])
def read_items_finiquitos_rut(rut: str, db: Session = Depends(get_db)):
    """Obtiene los items de los trabajadores por rut."""
    service = FiniquitosService(db)
    return service.get_items_by_rut(rut)
