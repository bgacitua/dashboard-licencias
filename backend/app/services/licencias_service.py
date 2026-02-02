from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.repositories.licencias_repository import LicenciasRepository
from app.schemas.licencias import LicenciaCreate, LicenciaResponse, LicenciaByRut
from app.core.exceptions import LicenciaNotFoundError
from app.core.logging_config import logger

class LicenciasService:
    def __init__(self, db: Session):
        self.repository = LicenciasRepository(db)

    def get_licencias(self, skip: int = 0, limit: int = 100) -> List[LicenciaResponse]:
        logger.info(f"Obteniendo licencias (skip={skip}, limit={limit})")
        return self.repository.get_all(skip, limit)

    def get_licencia_by_rut(self, rut: str) -> List[LicenciaByRut]:
        licencia = self.repository.get_licencia_by_rut(rut)
        if not licencia:
            raise LicenciaNotFoundError(rut)
        return licencia

    #! Evaluar eliminación de función 
    def create_licencia(self, licencia: LicenciaCreate) -> LicenciaResponse:
        logger.info(f"Creando licencia para: {licencia.nombre_trabajador}")
        return self.repository.create(licencia)

    def get_licencias_vigentes(self) -> List[Dict[str, Any]]:
        """Obtiene las licencias vigentes (fecha actual entre fecha_inicio y fecha_fin)"""
        logger.info("Obteniendo licencias vigentes")
        return self.repository.get_vigentes()

    def get_licencias_por_vencer(self, dias: int = 7) -> List[Dict[str, Any]]:
        """Obtiene licencias que vencen en los próximos N días"""
        logger.info(f"Obteniendo licencias por vencer en los próximos {dias} días")
        return self.repository.get_por_vencer(dias)

    def get_licencias_vencidas_recientes(self, dias: int = 7) -> List[Dict[str, Any]]:
        """Obtiene licencias que vencieron en los últimos N días"""
        logger.info(f"Obteniendo licencias vencidas en los últimos {dias} días")
        return self.repository.get_vencidas_recientes(dias)