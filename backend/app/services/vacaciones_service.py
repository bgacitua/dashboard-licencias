from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.repositories.vacaciones_repository import VacacionesRepository
from app.schemas.vacaciones import VacacionBase
from app.core.exceptions import LicenciaNotFoundError
from app.core.logging_config import logger

class VacacionesService:
    def __init__(self, db: Session):
        self.repository = VacacionesRepository(db)

    def get_vacaciones(self) -> List[VacacionBase]:
        logger.info(f"Obteniendo vacaciones")
        return self.repository.get_vacaciones_vigentes()
