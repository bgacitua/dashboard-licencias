from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.db.deps import get_marcas_db
from app.services.marcas_service import MarcasService

router = APIRouter()

@router.get("/hoy")
def read_marcas_hoy(
    limit: int = Query(default=100, ge=1, le=500, description="Cantidad de registros a obtener"),
    offset: int = Query(default=0, ge=0, description="Registros a saltar"),
    db: Session = Depends(get_marcas_db)
):
    """Obtiene las marcas de empleados del día actual con paginación"""
    service = MarcasService(db)
    marcas, total = service.get_marcas_hoy(limit, offset)
    return {
        "data": marcas,
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(marcas) < total
    }
