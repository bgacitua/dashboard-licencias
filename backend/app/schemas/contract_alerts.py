from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List


class ContractAlertResponse(BaseModel):
    """Respuesta para una alerta individual"""
    employee_name: str
    employee_rut: str
    employee_role: Optional[str] = None
    email: Optional[str] = None
    boss_name: Optional[str] = None
    boss_email: Optional[str] = None
    boss_of_boss_email: Optional[str] = None
    alert_date: Optional[str] = None
    alert_reason: Optional[str] = None
    expiration: Optional[str] = None
    days_since_start: Optional[int] = None
    employee_start_date: Optional[str] = None
    alert_type: Optional[str] = None

    class Config:
        from_attributes = True


class IncidenciaResponse(BaseModel):
    """Respuesta para una incidencia/permiso"""
    rut_empleado: str
    tipo_permiso: Optional[str] = None
    fecha_inicio_formato: Optional[str] = None
    fecha_fin_formato: Optional[str] = None


class BossGroupResponse(BaseModel):
    """Respuesta para alertas agrupadas por jefe"""
    boss_name: str
    boss_email: str
    boss_of_boss_email: Optional[str] = None
    employee_count: int
    employees: List[ContractAlertResponse]


class AlertStatsResponse(BaseModel):
    """Métricas resumen de alertas"""
    total_alerts: int
    segundo_plazo_count: int
    indefinido_count: int
    bosses_to_notify: int


class SendAlertsRequest(BaseModel):
    """Request para enviar alertas a jefes seleccionados"""
    bosses: List[dict]  # [{"boss_name": "...", "boss_email": "..."}]
    # Mismo override de rango que usa el listado. Sin esto el envío recalcula su
    # propio rango y puede no encontrar las alertas que el usuario tiene en pantalla.
    days: Optional[int] = None


class SendAlertsResponse(BaseModel):
    """Respuesta después de enviar alertas"""
    bosses_successful: int = 0
    bosses_failed: int = 0
    alerts_sent: int = 0
    alerts_failed: int = 0
    message: str = ""
    auth_required: bool = False


# === Calendario de Cierres ===

class CalendarioCierreCreate(BaseModel):
    """Request para crear/actualizar un cierre mensual"""
    anio: int
    mes: int  # 1-12
    fecha_cierre: date


class CalendarioCierreResponse(BaseModel):
    """Respuesta para un cierre mensual"""
    id: int
    anio: int
    mes: int
    fecha_cierre: date

    class Config:
        from_attributes = True


class CalendarioCierreYearResponse(BaseModel):
    """Respuesta con todos los cierres de un año"""
    anio: int
    cierres: List[CalendarioCierreResponse]


class ScheduleInfoResponse(BaseModel):
    """Info del rango de búsqueda actual"""
    fecha_inicio: str
    fecha_fin: str
    dias_rango: int
    fecha_cierre_mes: Optional[str] = None
    dias_al_cierre: Optional[int] = None
    modo: str  # "normal" o "cierre"
