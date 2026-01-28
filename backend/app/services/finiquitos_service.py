from sqlalchemy.orm import Session
from typing import List, Dict, Any
from app.repositories.finiquitos_repository import FiniquitosRepository
from app.schemas.finiquitos import FiniquitoCreate, FiniquitoResponse, FiniquitoItemResponse
from app.core.exceptions import FiniquitoNotFoundError
from app.core.logging_config import logger

class FiniquitosService:
    def __init__(self, db: Session):
        self.repository = FiniquitosRepository(db)

    def get_trabajadores_general(self) -> List[Dict[str, Any]]:
        logger.info("Obteniendo general de trabajadores")
        return self.repository.get_trabajadores_general()

    def get_items_cinco_meses(self) -> List[FiniquitoItemResponse]:
        logger.info("Obteniendo items de sueldo de los últimos 5 meses")
        return self.repository.get_items_cinco_meses()

    def get_item_by_rut(self, rut: str) -> List[FiniquitoItemResponse]:
        logger.info(f"Obteniendo items de sueldo por rut: {rut}")
        return self.repository.get_item_by_rut(rut)

    def get_item_variable_by_rut(self, rut: str, variable: str) -> List[FiniquitoItemResponse]:
        logger.info(f"Obteniendo items variables por rut: {rut}, variable: {variable}")
        return self.repository.get_item_variable_by_rut(rut, variable)

    def send_fecha_termino_finiquito(self, finiquito: FiniquitoCreate) -> FiniquitoResponse:
        logger.info(f"Actualizando fecha termino finiquito para rut: {finiquito.rut_trabajador}")
        return self.repository.update_fecha_termino(finiquito.rut_trabajador, finiquito.fecha_salida)

    def send_causal_despidos(self, finiquito: FiniquitoCreate) -> FiniquitoResponse:
        logger.info(f"Actualizando causal despido para rut: {finiquito.rut_trabajador}")
        # TODO: Agregar campo causal a FiniquitoCreate o crear un schema especifico
        return self.repository.update_causal(finiquito.rut_trabajador, "Necesidades de la empresa") # Placeholder

    def send_vacaciones_pendientes(self, finiquito: FiniquitoCreate) -> FiniquitoResponse:
        logger.info(f"Actualizando vacaciones pendientes para rut: {finiquito.rut_trabajador}")
        # TODO: Agregar campo vacaciones a FiniquitoCreate
        return self.repository.update_vacaciones(finiquito.rut_trabajador, 0.0) # Placeholder