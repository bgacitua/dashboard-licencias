from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import httpx

from app.repositories.finiquitos_repository import FiniquitosRepository
from app.schemas.finiquitos import (
    FiniquitoCreate, 
    FiniquitoResponse, 
    FiniquitoItemResponse,
    EmployeeVacationsResponse,
    EmployeeSueldoResponse,
    VacacionesDisponiblesResponse,
    VacationItem
)
from app.core.exceptions import FiniquitoNotFoundError
from app.core.logging_config import logger
from app.core.config import settings


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

    def get_descuentos_finiquitos_by_rut(self, rut: str) -> List[FiniquitoItemResponse]:
        """Obtiene los descuentos de finiquito por RUT, filtrando por conceptos específicos"""
        logger.info(f"Obteniendo descuentos de finiquito por rut: {rut}")
        return self.repository.get_descuentos_by_rut(rut)

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

    async def get_vacaciones_disponibles(self, rut: str, date: Optional[str] = None) -> VacacionesDisponiblesResponse:
        """
        Obtiene las vacaciones disponibles de un trabajador desde la API externa de BUK.
        
        Args:
            rut: RUT del trabajador (también funciona con employee_id)
            date: Fecha opcional para proyección de vacaciones (formato YYYY-MM-DD)
            
        Returns:
            VacacionesDisponiblesResponse con la información de vacaciones disponibles
            
        Raises:
            HTTPException: Si hay error en la comunicación con la API externa
        """
        logger.info(f"Consultando vacaciones disponibles para rut: {rut}, fecha: {date}")
        
        # Debug: Verificar si la API Key se está cargando
        if not settings.BUK_API_KEY:
            logger.error("CRITICAL: BUK_API_KEY no está configurada o está vacía.")

        # Construir URL con parámetro de fecha si está disponible
        url = f"{settings.BUK_API_BASE_URL}/employees/{rut}/vacations_available"
        if date:
            url += f"?date={date}"
            
        headers = {
            "auth_token": settings.BUK_API_KEY,
            "Content-Type": "application/json"
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                
                data = response.json()
                logger.info(f"Respuesta exitosa de API BUK para rut: {rut}")
                
                # Parsear respuesta de la API externa
                employee_response = EmployeeVacationsResponse(**data)
                
                # Calcular total de días disponibles sumando todas las vacaciones
                total_dias = sum(vacation.stock for vacation in employee_response.vacations)
                
                # Retornar respuesta simplificada para el frontend
                return VacacionesDisponiblesResponse(
                    employee_id=employee_response.employee_id,
                    full_name=employee_response.full_name,
                    vacations=employee_response.vacations,
                    total_dias_disponibles=total_dias
                )
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Error HTTP al consultar vacaciones para rut {rut}: {e.response.status_code}")
            raise Exception(f"Error al consultar API de vacaciones: {e.response.status_code}")
        except httpx.RequestError as e:
            logger.error(f"Error de conexión al consultar vacaciones para rut {rut}: {str(e)}")
            raise Exception(f"Error de conexión con API de vacaciones: {str(e)}")
        except Exception as e:
            logger.error(f"Error inesperado al consultar vacaciones para rut {rut}: {str(e)}")
            raise Exception(f"Error inesperado: {str(e)}")
    
    async def get_sueldo_base(self, rut: str) -> EmployeeSueldoResponse:
        """
        Obtiene el sueldo base de un trabajador desde la API externa de BUK.
        
        Args:
            rut: RUT del trabajador (también funciona con employee_id)
            
        Returns:
            EmployeeSueldoResponse con la información de sueldo base
            
        Raises:
            HTTPException: Si hay error en la comunicación con la API externa
        """
        logger.info(f"Consultando sueldo base para rut: {rut}")
        
        # Debug: Verificar si la API Key se está cargando
        if not settings.BUK_API_KEY:
            logger.error("CRITICAL: BUK_API_KEY no está configurada o está vacía.")

        url = f"{settings.BUK_API_BASE_URL}/employees/{rut}"
        headers = {
            "auth_token": settings.BUK_API_KEY,
            "Content-Type": "application/json"
        }
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                
                data = response.json()
                logger.info(f"Respuesta exitosa de API BUK para rut: {rut}")
                
                # Parsear respuesta de la API externa
                # La API de empleados devuelve los datos envueltos en "data"
                employee_data = data.get("data", data)
                
                employee_response = EmployeeSueldoResponse(**employee_data)
                
                # Extraer sueldo base desde current_job si existe
                base_wage = None
                if "current_job" in employee_data and employee_data["current_job"]:
                    base_wage = employee_data["current_job"].get("base_wage")
                
                # Retornar respuesta simplificada para el frontend
                return EmployeeSueldoResponse(
                    person_id=employee_response.person_id,
                    full_name=employee_response.full_name,
                    base_wage=base_wage
                )
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Error HTTP al consultar sueldo base para rut {rut}: {e.response.status_code}")
            raise Exception(f"Error al consultar API de sueldo base: {e.response.status_code}")
        except httpx.RequestError as e:
            logger.error(f"Error de conexión al consultar sueldo base para rut {rut}: {str(e)}")
            raise Exception(f"Error de conexión con API de sueldo base: {str(e)}")
        except Exception as e:
            logger.error(f"Error inesperado al consultar sueldo base para rut {rut}: {str(e)}")
            raise Exception(f"Error inesperado: {str(e)}")