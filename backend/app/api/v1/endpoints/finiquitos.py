from fastapi import APIRouter, Depends, HTTPException, Query
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

# Rutas estáticas ANTES que las paramétricas (evita que /{rut} las capture)
@router.get("/meses-anteriores", response_model=List[FiniquitoItemResponse])
def read_tres_meses_finiquitos(db: Session = Depends(get_db)):
    """Obtiene los items de los trabajadores de los últimos 5 meses."""
    service = FiniquitosService(db)
    return service.get_items_cinco_meses()

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
