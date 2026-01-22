from sqlalchemy.orm import Session
from typing import List, Dict, Any, Tuple
from app.repositories.marcas_repository import MarcasRepository
from app.core.logging_config import logger

class MarcasService:
    def __init__(self, db: Session):
        self.repository = MarcasRepository(db)

    def get_marcas_hoy(self, limit: int = 100, offset: int = 0) -> Tuple[List[Dict[str, Any]], int]:
        """Obtiene las marcas del día actual con paginación"""
        logger.info(f"Obteniendo marcas del día (limit={limit}, offset={offset})")
        return self.repository.get_marcas_hoy(limit, offset)
