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

#? Este endpoint servirá también para rescatar las bonificaciones mensuales, 
#? rescatar sueldo base, duración en la empresa para cálculo de años de 
#? indemnización.
@router.get("/{rut}", response_model=List[FiniquitoItemResponse]) 
def read_rut_finiquitos(rut: str, db: Session = Depends(get_db)):
    """Obtiene la información de los trabajadores."""
    service = FiniquitosService(db)
    return service.get_item_by_rut(rut)

@router.get("/{rut}/variable", response_model=List[FiniquitoItemResponse])
def read_rut_finiquitos_variable(rut: str, variable: str, db: Session = Depends(get_db)):
    """Obtiene la información de remuneración variable de los trabajadores."""
    service = FiniquitosService(db)
    return service.get_item_variable_by_rut(rut, variable)

@router.post("/fecha-desvinculacion", response_model=FiniquitoResponse)
def send_fecha_termino_finiquito(finiquito: FiniquitoCreate, db: Session = Depends(get_db)):
    """Envia la fecha de desvinculación."""
    service = FiniquitosService(db)
    return service.send_fecha_termino_finiquito(finiquito)

@router.post("/causal-despidos", response_model=FiniquitoResponse)
def send_causal_despidos(finiquito: FiniquitoCreate, db: Session = Depends(get_db)):
    """Envia la causal de despidos."""
    service = FiniquitosService(db)
    return service.send_causal_despidos(finiquito)

#? Se está utilizando la API de Buk para extraer esta información.
# @router.post("/vacaciones-pendientes", response_model=FiniquitoResponse)
# def send_vacaciones_pendientes(finiquito: FiniquitoCreate, db: Session = Depends(get_db)):
#     """Envia las vacaciones pendientes."""
#     service = FiniquitosService(db)
#     return service.send_vacaciones_pendientes(finiquito)

@router.get("/meses-anteriores", response_model=List[FiniquitoItemResponse])
def read_tres_meses_finiquitos(db: Session = Depends(get_db)):
    """Obtiene los items de los trabajadores de los últimos 5 meses."""
    service = FiniquitosService(db)
    return service.get_items_cinco_meses()
