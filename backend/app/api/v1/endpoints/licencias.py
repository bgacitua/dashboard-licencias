from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import SessionLocal
from app.models.licencia import Licencia
from app.schemas.licencia import LicenciaCreate, LicenciaResponse

router = APIRouter()

# Dependencia para obtener la sesión de base de datos en cada petición
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 1. Ruta para obtener todas las licencias
@router.get("/", response_model=List[LicenciaResponse])
def read_licencias(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    # Consulta a la base de datos
    licencias = db.query(Licencia).offset(skip).limit(limit).all()
    return licencias

# 2. Ruta para crear una nueva licencia
@router.post("/", response_model=LicenciaResponse)
def create_licencia(licencia: LicenciaCreate, db: Session = Depends(get_db)):
    # Creamos el modelo de base de datos a partir del esquema
    db_licencia = Licencia(
        nombre_trabajador=licencia.nombre_trabajador,
        rut_trabajador=licencia.rut_trabajador,
        fecha_inicio=licencia.fecha_inicio,
        fecha_fin=licencia.fecha_fin,
        motivo=licencia.motivo
    )
    # Guardamos en la BD
    db.add(db_licencia)
    db.commit()
    db.refresh(db_licencia) # Recargamos para obtener el ID generado
    return db_licencia