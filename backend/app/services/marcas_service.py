from sqlalchemy.orm import Session
from typing import List, Dict, Any, Tuple, Optional
from app.repositories.marcas_repository import MarcasRepository
from app.core.logging_config import logger
from datetime import date

class MarcasService:
    def __init__(self, db: Session):
        self.repository = MarcasRepository(db)

    def get_relojes(self) -> List[str]:
        """Obtiene la lista de relojes disponibles"""
        return self.repository.get_relojes()

    def get_marcas(
        self, 
        limit: int = 100, 
        offset: int = 0,
        fecha_inicio: Optional[date] = None,
        fecha_fin: Optional[date] = None,
        nombre: Optional[str] = None,
        rut: Optional[str] = None,
        reloj: Optional[str] = None,
        tipo_marca: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Obtiene las marcas con paginación y filtros"""
        return self.repository.get_marcas(
            limit, offset, fecha_inicio, fecha_fin, nombre, rut, reloj, tipo_marca
        )
