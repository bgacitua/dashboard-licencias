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

    def get_item_by_rut(self, rut: str) -> List[FiniquitoItemResponse]:
        logger.info(f"Obteniendo items de sueldo por rut: {rut}")
        return self.repository.get_item_by_rut(rut)

    # def get_item_variable_by_rut(self, rut: str, variable: str) -> List[FiniquitoItemResponse]:
    #     logger.info(f"Obteniendo items variables por rut: {rut}, variable: {variable}")
    #     return self.repository.get_item_variable_by_rut(rut, variable)

    def get_descuentos_finiquitos_by_rut(self, rut: str) -> List[FiniquitoItemResponse]:
        """Obtiene los descuentos de finiquito por RUT, filtrando por conceptos específicos"""
        logger.info(f"Obteniendo descuentos de finiquito por rut: {rut}")
        return self.repository.get_descuentos_by_rut(rut)

    # def send_fecha_termino_finiquito(self, finiquito: FiniquitoCreate) -> FiniquitoResponse:
    #     logger.info(f"Actualizando fecha termino finiquito para rut: {finiquito.rut_trabajador}")
    #     return self.repository.update_fecha_termino(finiquito.rut_trabajador, finiquito.fecha_salida)

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
    
    async def get_descuentos_by_rut_finiquito(self, rut: str) -> List[FiniquitoItemResponse]:
        """
        Obtiene los descuentos de un trabajador desde la API externa de BUK.
        
        Args:
            rut: RUT del trabajador (también funciona con employee_id)
            
        Returns:
            List[FiniquitoItemResponse] con la información de descuentos encontrados
            
        Raises:
            HTTPException: Si hay error en la comunicación con la API externa
        """
        logger.info(f"Consultando descuentos para rut: {rut}")
        
        # Limpiar RUT (quitar puntos) según requerimiento para API externa
        rut = rut.replace(".", "")
        
        # Debug: Verificar si la API Key se está cargando
        if not settings.BUK_API_KEY:
            logger.error("CRITICAL: BUK_API_KEY no está configurada o está vacía.")

        url = f"{settings.BUK_API_BASE_URL}/employees/{rut}/payroll_detail"
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
                
                # Si employee_data es una lista (posiblemente múltiples liquidaciones), tomamos la primera
                if isinstance(employee_data, list):
                    if employee_data:
                        employee_data = employee_data[0]
                    else:
                        logger.warning(f"No se encontraron datos de liquidación para rut: {rut}")
                        return []
                
                # Buscar en lines_settlement
                lines = employee_data.get("lines_settlement", [])
                descuentos_encontrados = []
                
                logger.info(f"Procesando {len(lines)} líneas de liquidación para encontrar descuentos")
                
                target_discounts = ["Descuento Por Planilla", "Prestamo Interno"]
                
                for line in lines:
                    line_name = line.get("name", "")
                    # Verificar si es uno de los descuentos buscados
                    # Usamos coincidencia exacta o "contains" según sea más robusto. 
                    # El usuario pidió buscar "exacto" o muy específico, pero un contains es más seguro ante variaciones.
                    # Sin embargo, el requerimiento dice: buscar "name": "Descuento Por Planilla"
                    
                    if line_name in target_discounts:
                        amount = line.get("amount", 0)
                        description = line.get("description", "") or line_name
                        
                        logger.info(f"Descuento encontrado: {line_name}, Monto: {amount}")
                        
                        # Mapear a FiniquitoItemResponse
                        item = FiniquitoItemResponse(
                            rut_trabajador=rut,
                            concepto=line_name,  # Usamos el nombre como concepto/descripción principal
                            detalle=description, # Descripción detallada (e.g. "Cuota 1/3")
                            monto=amount,
                            income_type="descuento", # Marcamos como descuento
                            periodo="Actual" # Indica que viene de la liquidación actual
                        )
                        descuentos_encontrados.append(item)
                
                return descuentos_encontrados
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Error HTTP al consultar descuentos para rut {rut}: {e.response.status_code}")
            raise Exception(f"Error al consultar API de descuentos: {e.response.status_code}")
        except httpx.RequestError as e:
            logger.error(f"Error de conexión al consultar descuentos para rut {rut}: {str(e)}")
            raise Exception(f"Error de conexión con API de descuentos: {str(e)}")
            logger.error(f"Error inesperado al consultar descuentos para rut {rut}: {str(e)}")
            raise Exception(f"Error inesperado: {str(e)}")

    async def get_salary_history(self, rut: str, start_date_str: str) -> List[Dict[str, Any]]:
        """
        Obtiene el historial de sueldos (últimos N meses) desde BUK.
        Usa /payroll_detail?start={fecha} para filtrar.
        
        Para periodos donde worked_days < 30 (licencias, permisos, etc.),
        se sustituye el sueldo base por el del mes anterior o siguiente
        que tenga worked_days >= 30, obteniendo así el sueldo base teórico.
        
        Args:
            rut: RUT del trabajador (se limpia internamente)
            start_date_str: Fecha de inicio (DD-MM-YYYY)
            
        Returns:
            Lista de objetos con periodo, monto, sort_date y worked_days
        """
        logger.info(f"Consultando historial de sueldos para rut: {rut}, desde: {start_date_str}")
        
        # 1. Usar fecha recibida (DD-MM-YYYY)
        # start_date_str viene listo del frontend
        
        # Limpiar RUT (sin puntos ni guión)
        rut_clean = rut.replace(".","").replace("-", "").strip()
        
        if not settings.BUK_API_KEY:
            logger.error("CRITICAL: BUK_API_KEY no está configurada.")

        # 2. Construir URL
        # Endpoint: /employees/{id}/payroll_detail?start=DD-MM-YYYY
        url = f"{settings.BUK_API_BASE_URL}/employees/{rut_clean}/payroll_detail?start={start_date_str}"
        
        headers = {
            "auth_token": settings.BUK_API_KEY,
            "Content-Type": "application/json"
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                
                raw_history = []
                page = 1
                has_more_pages = True
                is_first_settlement = True
                
                # Loop for pagination
                while has_more_pages and page <= 10: # Safety limit of 10 pages (~200 records usually)
                    # Append page param
                    paged_url = f"{url}&page={page}"
                    
                    logger.info(f"Consultando página {page} de historial: {paged_url}")
                    response = await client.get(paged_url, headers=headers)
                    response.raise_for_status()
                    
                    data = response.json()
                    
                    # Estructura típica BUK: 
                    # { "data": [ ... ], "pagination": { "total_pages": X, "page": Y ... } }
                    
                    payload = data.get("data", [])
                    pagination = data.get("pagination", {})
                    
                    if not payload:
                        has_more_pages = False
                        break
                        
                    # Procesar liquidaciones de esta página
                    for settlement in payload:
                        # Extract month and year from data
                        month = settlement.get("month")
                        year = settlement.get("year")
                        
                        # Extract worked_days from settlement level
                        worked_days = settlement.get("worked_days", 30)
                        try:
                            worked_days = int(worked_days) if worked_days is not None else 30
                        except (ValueError, TypeError):
                            worked_days = 30
                        
                        # Fallback if month/year are missing, though BUK usually sends them
                        if not month or not year:
                            # Try to parse from 'period' field "YYYY-MM-DD"
                            raw_period = settlement.get("period", "")
                            if raw_period:
                                try:
                                    parts = raw_period.split("-")
                                    year = int(parts[0])
                                    month = int(parts[1])
                                except:
                                    pass
                        
                        # Construct Display Period (e.g., "MM-YYYY")
                        display_period = ""
                        sort_date = ""
                        
                        if month and year:
                            # Ensure ints
                            try:
                                month = int(month)
                                year = int(year)
                                display_period = f"{month:02d}-{year}"
                                sort_date = f"{year}-{month:02d}"
                            except:
                                display_period = settlement.get("period", "")
                                sort_date = display_period
                        else:
                             display_period = settlement.get("period", "")
                             sort_date = display_period

                        
                        # Buscar "Sueldo Base" en lines_settlement
                        # Estructura: settlement -> "lines_settlement" -> [ { "type": "haber", "income_type": "remuneracion_fija", "name": "Sueldo Base", "amount": X } ]
                        lines = settlement.get("lines_settlement", [])
                        base_salary = 0
                        
                        # Debug log for first item to see structure
                        if is_first_settlement:
                             logger.info(f"Sample First Settlement: worked_days={worked_days}, lines={lines[:2]}")
                             is_first_settlement = False

                        for line in lines:
                            # Verificar tipo y nombre
                            l_type = str(line.get("type", "")).lower()
                            l_name = str(line.get("name", "")).lower()
                            l_income_type = str(line.get("income_type", "")).lower()
                            l_amount = line.get("amount", 0)
                            
                            # Log potential candidates to see strictly what we are missing
                            if "sueldo" in l_name:
                                logger.info(f"Candidate Line: name='{l_name}', type='{l_type}', income_type='{l_income_type}', amount={l_amount}")

                            # Strict check as requested: type="haber", income_type="remuneracion_fija", name matches "sueldo base"
                            if l_type == "haber" and l_income_type == "remuneracion_fija" and "sueldo base" in l_name:
                                base_salary = l_amount
                                break
                        
                        if base_salary > 0:
                            raw_history.append({
                                "period": display_period,
                                "amount": base_salary,
                                "sort_date": sort_date,
                                "worked_days": worked_days
                            })
                        elif display_period:
                             logger.warning(f"No Base Salary found for period {display_period}")
                    
                    # Check pagination info to continue or stop
                    total_pages = pagination.get("total_pages", 1)
                    if page >= total_pages:
                        has_more_pages = False
                    else:
                        page += 1
                
                # --- Post-procesamiento: Sueldo Base Teórico ---
                # Ordenar cronológicamente (ascendente) para buscar mes anterior/siguiente
                raw_history.sort(key=lambda x: x.get("sort_date", ""))
                
                # Sustituir sueldo base donde worked_days < 30
                for i, item in enumerate(raw_history):
                    if item["worked_days"] < 30:
                        original_amount = item["amount"]
                        replaced = False
                        
                        # Intentar mes anterior (i - 1)
                        if i > 0 and raw_history[i - 1]["worked_days"] >= 30:
                            item["amount"] = raw_history[i - 1]["amount"]
                            replaced = True
                            logger.info(
                                f"Sueldo Base Teórico: Periodo {item['period']} "
                                f"(worked_days={item['worked_days']}) -> "
                                f"Usando sueldo del mes anterior {raw_history[i - 1]['period']}: "
                                f"${original_amount:,} -> ${item['amount']:,}"
                            )
                        # Si no, intentar mes siguiente (i + 1)
                        elif i < len(raw_history) - 1 and raw_history[i + 1]["worked_days"] >= 30:
                            item["amount"] = raw_history[i + 1]["amount"]
                            replaced = True
                            logger.info(
                                f"Sueldo Base Teórico: Periodo {item['period']} "
                                f"(worked_days={item['worked_days']}) -> "
                                f"Usando sueldo del mes siguiente {raw_history[i + 1]['period']}: "
                                f"${original_amount:,} -> ${item['amount']:,}"
                            )
                        
                        if not replaced:
                            logger.warning(
                                f"Sueldo Base Teórico: Periodo {item['period']} "
                                f"(worked_days={item['worked_days']}) -> "
                                f"No se encontró mes adyacente con >= 30 días. "
                                f"Manteniendo valor original ${original_amount:,}"
                            )
                
                # Ordenar por fecha descendente (lo más reciente primero)
                raw_history.sort(key=lambda x: x.get("sort_date", ""), reverse=True)
                
                return raw_history
                
        except Exception as e:
            logger.error(f"Error al obtener historial de sueldos: {str(e)}")
            raise Exception(f"Error al consultar historial: {str(e)}")
