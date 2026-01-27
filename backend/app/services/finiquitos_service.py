from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.repositories.finiquitos_repository import FiniquitosRepository
from app.schemas.finiquitos import FiniquitoCreate, FiniquitoResponse
from app.core.exceptions import FiniquitoNotFoundError
from app.core.logging_config import logger

class FiniquitosService:
    def __init__(self, db: Session):
        self.repository = FiniquitosRepository(db)

    def get_trabajadores_general(self) -> List[FiniquitoResponse]:
        logger.info("Obteniendo finiquitos general")
        return self.repository.get_trabajadores_general()

    def get_trabajadores_items(self) -> List[FiniquitoResponse]:
        logger.info("Obteniendo finiquitos items")
        return self.repository.get_trabajadores_items()

    def get_items_tres_meses(self) -> List[FiniquitoResponse]:
        logger.info("Obteniendo items de sueldo de los últimos 3 meses")
        return self.repository.get_items_tres_meses()

    def get_items_by_rut(self, rut: str) -> List[FiniquitoResponse]:
        logger.info(f"Obteniendo items de sueldo por rut: {rut}")
        return self.repository.get_items_by_rut(rut)