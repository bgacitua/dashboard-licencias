from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.db.deps import get_db
from app.services.licencias_service import LicenciasService
from app.schemas.licencias import LicenciaCreate, LicenciaResponse

router = APIRouter()

@router.get("/", response_model=List[LicenciaResponse])
def read_licencias(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Obtiene todas las licencias con paginación"""
    service = LicenciasService(db)
    return service.get_licencias(skip, limit)

@router.get("/vigentes", response_model=List[Dict[str, Any]])
def read_licencias_vigentes(db: Session = Depends(get_db)):
    """Obtiene las licencias vigentes (fecha actual entre fecha_inicio y fecha_fin)"""
    service = LicenciasService(db)
    return service.get_licencias_vigentes()

@router.get("/{licencia_id}", response_model=LicenciaResponse)
def read_licencia(licencia_id: int, db: Session = Depends(get_db)):
    """Obtiene una licencia por su ID"""
    service = LicenciasService(db)
    return service.get_licencia(licencia_id)

@router.post("/", response_model=LicenciaResponse)
def create_licencia(licencia: LicenciaCreate, db: Session = Depends(get_db)):
    """Crea una nueva licencia"""
    service = LicenciasService(db)
    return service.create_licencia(licencia)