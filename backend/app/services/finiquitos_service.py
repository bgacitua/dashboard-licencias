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

    def get_item_by_rut(self, rut: str, limit: int = 15) -> List[FiniquitoItemResponse]:
        logger.info(f"Obteniendo items de sueldo por rut: {rut} (limit={limit})")
        return self.repository.get_item_by_rut(rut, limit=limit)

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
        except Exception as e:
            logger.error(f"Error inesperado al consultar descuentos para rut {rut}: {str(e)}")
            raise Exception(f"Error inesperado: {str(e)}")

    async def get_salary_history(self, rut: str, start_date_str: str) -> List[Dict[str, Any]]:
        """
        Obtiene el historial de sueldos (últimos 48 meses) desde BUK.

        Lógica:
        1. Genera los 48 períodos esperados hacia atrás desde el mes anterior
           a la fecha de salida (start_date_str en formato DD-MM-YYYY).
        2. Descarga todos los payroll_detail paginados y extrae el Sueldo Base
           de cada liquidación (solo periodos con sueldo base > 0).
        3. Para liquidaciones con worked_days < 30 (licencias/permisos sin sueldo),
           sustituye el monto por el del mes anterior si coincide, o el del mes
           siguiente en caso contrario.
        4. Rellena los períodos ausentes de la ventana de 48 meses con el mismo
           criterio: mes anterior si coincide, mes posterior si no.
        5. Devuelve los 48 períodos en orden descendente.

        Args:
            rut: RUT del trabajador (ya debe llegar limpio).
            start_date_str: Fecha de inicio (DD-MM-YYYY) — primer mes que NO se
                            debe incluir (i.e., mes de salida).
        Returns:
            Lista de exactamente 48 dicts con period, amount, sort_date, worked_days.
        """
        from datetime import date, timedelta
        import calendar

        logger.info(f"Consultando historial de sueldos para rut: {rut}, desde: {start_date_str}")

        rut_clean = rut.replace(".", "").replace("-", "").strip()

        if not settings.BUK_API_KEY:
            logger.error("CRITICAL: BUK_API_KEY no está configurada.")

        # --- 1. Determinar el mes de inicio de la ventana de 48 meses ---
        # start_date_str es DD-MM-YYYY (fecha de salida / término).
        # El primer período incluido es el mes ANTERIOR a esa fecha.
        try:
            d, m, y = [int(x) for x in start_date_str.split("-")]
            exit_date = date(y, m, d)
        except Exception:
            logger.warning(f"No se pudo parsear start_date_str='{start_date_str}', usando hoy.")
            exit_date = date.today()

        # Mes anterior al de salida (último mes a incluir en el historial)
        first_month = exit_date.replace(day=1)
        last_included = (first_month - timedelta(days=1)).replace(day=1)  # mes anterior

        # Generar los 48 sort_date esperados en orden ASCENDENTE: más antiguo primero
        expected_months: List[str] = []
        cur = last_included
        for _ in range(48):
            expected_months.append(f"{cur.year}-{cur.month:02d}")
            # Retroceder un mes
            if cur.month == 1:
                cur = cur.replace(year=cur.year - 1, month=12)
            else:
                cur = cur.replace(month=cur.month - 1)
        expected_months.reverse()  # ahora: más antiguo → más reciente

        # --- 2. Construir URL de BUK ---
        # BUK interpreta ?start= como "devolver liquidaciones DESDE esta fecha en adelante".
        # Calculamos la fecha del mes más antiguo de la ventana de 48 meses:
        #   oldest = last_included retrocedido 47 meses (para tener 48 meses en total,
        #   incluyendo last_included).
        oldest = last_included
        for _ in range(47):
            if oldest.month == 1:
                oldest = oldest.replace(year=oldest.year - 1, month=12)
            else:
                oldest = oldest.replace(month=oldest.month - 1)

        buk_start = f"01-{oldest.month:02d}-{oldest.year}"  # DD-MM-YYYY para BUK
        logger.info(
            f"Ventana de 48 meses: {oldest.year}-{oldest.month:02d} -> "
            f"{last_included.year}-{last_included.month:02d} | BUK start={buk_start}"
        )

        url = (
            f"{settings.BUK_API_BASE_URL}/employees/{rut_clean}/payroll_detail"
            f"?start={buk_start}"
        )
        headers = {
            "auth_token": settings.BUK_API_KEY,
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:

                raw_records: Dict[str, Dict] = {}  # sort_date -> {amount, worked_days}
                page = 1
                is_first = True

                while page <= 10:
                    paged_url = f"{url}&page={page}"
                    logger.info(f"Consultando página {page}: {paged_url}")
                    response = await client.get(paged_url, headers=headers)
                    response.raise_for_status()
                    data = response.json()

                    payload = data.get("data", [])
                    pagination = data.get("pagination", {})

                    if not payload:
                        break

                    for settlement in payload:
                        month = settlement.get("month")
                        year = settlement.get("year")
                        worked_days = settlement.get("worked_days", 30)
                        try:
                            worked_days = int(worked_days) if worked_days is not None else 30
                        except (ValueError, TypeError):
                            worked_days = 30

                        if not month or not year:
                            raw_period = settlement.get("period", "")
                            if raw_period:
                                try:
                                    parts = raw_period.split("-")
                                    year = int(parts[0])
                                    month = int(parts[1])
                                except Exception:
                                    continue

                        try:
                            month = int(month)
                            year = int(year)
                        except (ValueError, TypeError):
                            continue

                        sort_date = f"{year}-{month:02d}"
                        display_period = f"{month:02d}-{year}"

                        # Extraer Sueldo Base
                        lines = settlement.get("lines_settlement", [])
                        base_salary = 0

                        if is_first:
                            logger.info(f"Sample First Settlement: worked_days={worked_days}, lines={lines[:2]}")
                            is_first = False

                        for line in lines:
                            l_type = str(line.get("type", "")).lower()
                            l_name = str(line.get("name", "")).lower()
                            l_income_type = str(line.get("income_type", "")).lower()
                            l_amount = line.get("amount", 0)

                            if "sueldo" in l_name:
                                logger.info(
                                    f"Candidate: name='{l_name}', type='{l_type}', "
                                    f"income_type='{l_income_type}', amount={l_amount}"
                                )

                            if (
                                l_type == "haber"
                                and l_income_type == "remuneracion_fija"
                                and "sueldo base" in l_name
                            ):
                                base_salary = l_amount
                                break

                        if base_salary > 0:
                            raw_records[sort_date] = {
                                "period": display_period,
                                "amount": base_salary,
                                "sort_date": sort_date,
                                "worked_days": worked_days,
                            }
                        else:
                            logger.warning(f"No Base Salary found for period {display_period}")

                    total_pages = pagination.get("total_pages", 1)
                    if page >= total_pages:
                        break
                    page += 1

                # --- 3. Filtrar registros fuera de la ventana de 48 meses ---
                expected_set = set(expected_months)
                for k in list(raw_records.keys()):
                    if k not in expected_set:
                        logger.info(f"[filtro] Descartando período fuera de ventana: {k}")
                        del raw_records[k]

                # --- 4. Sustituir worked_days < 30 en los registros recuperados ---
                # Regla de usuario:
                # - Para los meses 01–06 (primer semestre del año) y 07–12 (segundo semestre),
                #   el sueldo base de un mes con menos de 30 días trabajados debe
                #   aproximarse usando preferentemente los meses POSTERIORES dentro
                #   del mismo semestre (ej: licencia en enero toma sueldo de febreromarzo, etc.).
                # - Solo si no existe referencia posterior válida en el mismo semestre
                #   intentamos usar una referencia anterior del mismo semestre.
                #
                # Trabajamos sobre la lista ordenada ASCENDENTE (más antiguo primero).
                sorted_keys = sorted(raw_records.keys())

                def _half_from_month(month: int) -> int:
                    """Devuelve 1 para meses 1-6 y 2 para meses 7-12."""
                    return 1 if month <= 6 else 2

                for idx, key in enumerate(sorted_keys):
                    item = raw_records[key]
                    if item["worked_days"] < 30:
                        original = item["amount"]
                        replaced = False

                        # Determinar año/mes y semestre del período actual
                        cur_year, cur_month = map(int, key.split("-"))
                        cur_half = _half_from_month(cur_month)

                        # 4.a) Intentar con meses POSTERIORES del mismo semestre (preferencia usuario)
                        for j in range(idx + 1, len(sorted_keys)):
                            cand_key = sorted_keys[j]
                            cy, cm = map(int, cand_key.split("-"))
                            if cy != cur_year or _half_from_month(cm) != cur_half:
                                # Salir cuando cambia de año o de semestre
                                break
                            cand_item = raw_records[cand_key]
                            if cand_item["worked_days"] >= 30:
                                item["amount"] = cand_item["amount"]
                                replaced = True
                                logger.info(
                                    f"[worked_days<30] {key}: ${original:,} → "
                                    f"${item['amount']:,} (del mes posterior {cand_key} dentro del mismo semestre)"
                                )
                                break

                        # 4.b) Si no hay posterior válido, intentar con meses ANTERIORES del mismo semestre
                        if not replaced:
                            for j in range(idx - 1, -1, -1):
                                cand_key = sorted_keys[j]
                                cy, cm = map(int, cand_key.split("-"))
                                if cy != cur_year or _half_from_month(cm) != cur_half:
                                    break
                                cand_item = raw_records[cand_key]
                                if cand_item["worked_days"] >= 30:
                                    item["amount"] = cand_item["amount"]
                                    replaced = True
                                    logger.info(
                                        f"[worked_days<30] {key}: ${original:,} → "
                                        f"${item['amount']:,} (del mes anterior {cand_key} dentro del mismo semestre)"
                                    )
                                    break

                        if not replaced:
                            logger.warning(
                                f"[worked_days<30] {key}: sin mes adyacente con >=30 días. "
                                f"Manteniendo ${original:,}"
                            )

                # --- 5. Usar ventana de 48 meses y rellenar huecos ---
                # Para cada mes esperado busca en raw_records; si falta, rellena
                # con el mismo criterio de semestres:
                #   - Preferir un mes POSTERIOR dentro del mismo semestre con dato.
                #   - Si no existe, usar un mes ANTERIOR del mismo semestre.
                filled: List[Dict] = []
                for i, sort_date in enumerate(expected_months):
                    m_num = int(sort_date.split("-")[1])
                    y_num = int(sort_date.split("-")[0])
                    display = f"{m_num:02d}-{y_num}"
                    cur_half = _half_from_month(m_num)

                    if sort_date in raw_records:
                        filled.append(raw_records[sort_date].copy())
                    else:
                        # Período ausente (licencia sin sueldo, ej. sueldo=0)
                        # Buscar valor de referencia:
                        #   1) posterior del mismo semestre
                        #   2) anterior del mismo semestre
                        ref_amount = None

                        # 5.a) Buscar el mes POSTERIOR más próximo del mismo semestre que sí exista
                        for j in range(i + 1, len(expected_months)):
                            candidate = expected_months[j]
                            cy, cm = map(int, candidate.split("-"))
                            if cy != y_num or _half_from_month(cm) != cur_half:
                                break
                            if candidate in raw_records:
                                ref_amount = raw_records[candidate]["amount"]
                                logger.info(
                                    f"[gap] {sort_date}: rellenado con posterior {candidate} "
                                    f"(${ref_amount:,}) dentro del mismo semestre"
                                )
                                break

                        # 5.b) Si no hay posterior, buscar el mes ANTERIOR más próximo del mismo semestre
                        if ref_amount is None:
                            for j in range(i - 1, -1, -1):
                                candidate = expected_months[j]
                                cy, cm = map(int, candidate.split("-"))
                                if cy != y_num or _half_from_month(cm) != cur_half:
                                    break
                                if candidate in raw_records:
                                    prev_amt = raw_records[candidate]["amount"]
                                    ref_amount = prev_amt
                                    logger.info(
                                        f"[gap] {sort_date}: rellenado con anterior {candidate} "
                                        f"(${prev_amt:,}) dentro del mismo semestre"
                                    )
                                    break

                        if ref_amount is None:
                            logger.warning(f"[gap] {sort_date}: sin referencia disponible, se usa 0")
                            ref_amount = 0

                        filled.append({
                            "period": display,
                            "amount": ref_amount,
                            "sort_date": sort_date,
                            "worked_days": 0,  # marcado como rellenado
                            "filled": True,     # flag informativo
                        })

                # --- 6. Ordenar descendente (más reciente primero) y devolver ---
                filled.sort(key=lambda x: x["sort_date"], reverse=True)
                logger.info(f"Historial final: {len(filled)} períodos devueltos para rut {rut}")
                return filled

        except Exception as e:
            logger.error(f"Error al obtener historial de sueldos: {str(e)}")
            raise Exception(f"Error al consultar historial: {str(e)}")

