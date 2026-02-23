from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from app.db.deps import get_db
from app.services.contract_alerts_service import ContractAlertsService
from app.schemas.contract_alerts import (
    AlertStatsResponse,
    SendAlertsRequest,
    SendAlertsResponse,
    CalendarioCierreCreate,
    CalendarioCierreResponse,
    CalendarioCierreYearResponse,
    ScheduleInfoResponse,
)

router = APIRouter()


# === Alertas ===

@router.get("/", response_model=List[Dict[str, Any]])
def get_alerts(days: Optional[int] = None, db: Session = Depends(get_db)):
    """Obtiene alertas pendientes. days: override manual del rango de días."""
    service = ContractAlertsService(db)
    return service.get_alerts(days_override=days)


@router.get("/grouped", response_model=List[Dict[str, Any]])
def get_alerts_grouped(days: Optional[int] = None, db: Session = Depends(get_db)):
    """Obtiene alertas agrupadas por jefe."""
    service = ContractAlertsService(db)
    return service.get_alerts_grouped_by_boss(days_override=days)


@router.get("/stats", response_model=AlertStatsResponse)
def get_alert_stats(days: Optional[int] = None, db: Session = Depends(get_db)):
    """Obtiene métricas resumen de alertas pendientes."""
    service = ContractAlertsService(db)
    return service.get_stats(days_override=days)


@router.get("/schedule-info", response_model=ScheduleInfoResponse)
def get_schedule_info(db: Session = Depends(get_db)):
    """Obtiene info del rango de búsqueda actual (modo, fechas, días al cierre)"""
    service = ContractAlertsService(db)
    return service.get_schedule_info()


@router.post("/send", response_model=SendAlertsResponse)
def send_alerts(request: SendAlertsRequest, db: Session = Depends(get_db)):
    """Envía alertas a los jefes seleccionados vía Outlook"""
    service = ContractAlertsService(db)
    return service.send_alerts_by_boss(request.bosses)


# === Calendario de Cierres ===

@router.get("/calendario/{year}", response_model=CalendarioCierreYearResponse)
def get_calendario(year: int, db: Session = Depends(get_db)):
    """Obtiene las fechas de cierre de un año"""
    service = ContractAlertsService(db)
    return service.get_calendario(year)


@router.post("/calendario", status_code=status.HTTP_201_CREATED)
def save_cierre(data: CalendarioCierreCreate, db: Session = Depends(get_db)):
    """Crea o actualiza una fecha de cierre mensual"""
    if data.mes < 1 or data.mes > 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El mes debe estar entre 1 y 12"
        )
    service = ContractAlertsService(db)
    success = service.save_cierre(data.anio, data.mes, data.fecha_cierre)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al guardar la fecha de cierre"
        )
    return {"message": f"Cierre {data.mes}/{data.anio} guardado exitosamente"}


@router.delete("/calendario/{cierre_id}")
def delete_cierre(cierre_id: int, db: Session = Depends(get_db)):
    """Elimina una fecha de cierre"""
    service = ContractAlertsService(db)
    success = service.delete_cierre(cierre_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cierre no encontrado"
        )
    return {"message": "Cierre eliminado exitosamente"}
