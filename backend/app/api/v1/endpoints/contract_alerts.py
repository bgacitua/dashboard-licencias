import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

import httpx

from app.core.config import settings
from app.db.deps import get_db
from app.services.contract_alerts_service import ContractAlertsService
from app.services.email_token_service import save_tokens
from app.core.logging_config import logger
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

_SCOPES = "https://graph.microsoft.com/Mail.Send offline_access"


# === OAuth2 Microsoft ===

@router.get("/auth/login")
def microsoft_login():
    """Redirige al login de Microsoft para autorizar el envío de correos."""
    params = {
        "client_id": settings.AZURE_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": settings.AZURE_REDIRECT_URI,
        "response_mode": "query",
        "scope": _SCOPES,
    }
    auth_url = (
        f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}"
        f"/oauth2/v2.0/authorize?{urllib.parse.urlencode(params)}"
    )
    return RedirectResponse(url=auth_url)


@router.get("/auth/callback", response_class=HTMLResponse)
def microsoft_callback(code: str = None, error: str = None):
    """Recibe el código OAuth2 de Microsoft, obtiene los tokens y los guarda."""
    if error:
        logger.error(f"Error en callback OAuth2: {error}")
        return HTMLResponse(content=_auth_html(False, error), status_code=400)

    if not code:
        return HTMLResponse(
            content=_auth_html(False, "No se recibió código de autorización"),
            status_code=400,
        )

    try:
        resp = httpx.post(
            f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/oauth2/v2.0/token",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.AZURE_CLIENT_ID,
                "client_secret": settings.AZURE_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.AZURE_REDIRECT_URI,
                "scope": _SCOPES,
            },
            timeout=15,
        )
        resp.raise_for_status()
        token_data = resp.json()
        save_tokens(token_data["access_token"], token_data["refresh_token"])
        logger.info("Autorización de Microsoft completada exitosamente")
        return HTMLResponse(content=_auth_html(True))
    except Exception as e:
        logger.error(f"Error intercambiando código por token: {e}")
        return HTMLResponse(content=_auth_html(False, str(e)), status_code=500)


def _auth_html(success: bool, error_msg: str = "") -> str:
    if success:
        return """
        <html><head><title>Autorización exitosa</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;
                     height:100vh;margin:0;background:#f8f9fa">
          <div style="text-align:center;padding:40px;background:white;border-radius:12px;
                      box-shadow:0 2px 10px rgba(0,0,0,.1)">
            <div style="font-size:48px">✅</div>
            <h2 style="color:#16a34a;margin:16px 0 8px">¡Autorización exitosa!</h2>
            <p style="color:#6b7280">Ya puedes cerrar esta ventana y enviar los correos.</p>
            <script>setTimeout(() => window.close(), 2000)</script>
          </div>
        </body></html>
        """
    return f"""
    <html><head><title>Error de autorización</title></head>
    <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;
                 height:100vh;margin:0;background:#f8f9fa">
      <div style="text-align:center;padding:40px;background:white;border-radius:12px;
                  box-shadow:0 2px 10px rgba(0,0,0,.1)">
        <div style="font-size:48px">❌</div>
        <h2 style="color:#dc2626;margin:16px 0 8px">Error de autorización</h2>
        <p style="color:#6b7280">{error_msg}</p>
        <p style="color:#9ca3af;font-size:14px">Puedes cerrar esta ventana e intentarlo de nuevo.</p>
      </div>
    </body></html>
    """


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
