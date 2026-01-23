from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date

from app.db.deps import get_marcas_db
from app.services.marcas_service import MarcasService

router = APIRouter()

@router.get("/relojes", response_model=List[str])
def read_relojes(db: Session = Depends(get_marcas_db)):
    """Obtiene la lista de relojes/torniquetes disponibles"""
    service = MarcasService(db)
    return service.get_relojes()

@router.get("/")
def read_marcas(
    limit: int = Query(default=100, ge=1, le=500, description="Cantidad de registros"),
    offset: int = Query(default=0, ge=0, description="Registros a saltar"),
    fecha_inicio: Optional[date] = Query(default=None, description="Fecha inicio del rango (YYYY-MM-DD)"),
    fecha_fin: Optional[date] = Query(default=None, description="Fecha fin del rango (YYYY-MM-DD)"),
    nombre: Optional[str] = Query(default=None, description="Filtrar por nombre (busca en todo el historial)"),
    rut: Optional[str] = Query(default=None, description="Filtrar por RUT (busca en todo el historial)"),
    reloj: Optional[str] = Query(default=None, description="Filtrar por nombre de reloj"),
    tipo_marca: Optional[str] = Query(default=None, description="Filtrar por tipo: IN o OUT"),
    db: Session = Depends(get_marcas_db)
):
    """Obtiene las marcas de empleados con filtros opcionales"""
    service = MarcasService(db)
    marcas, total = service.get_marcas(
        limit, offset, fecha_inicio, fecha_fin, nombre, rut, reloj, tipo_marca
    )
    return {
        "data": marcas,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(marcas) < total
    }

# Endpoint legacy para compatibilidad
@router.get("/hoy")
def read_marcas_hoy(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_marcas_db)
):
    """Obtiene las marcas del día actual (endpoint legacy)"""
    service = MarcasService(db)
    marcas, total = service.get_marcas(limit, offset)
    return {
        "data": marcas,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(marcas) < total
    }
