import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Request, status
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


# === Seguimiento ===

@router.get("/tracking", response_model=List[Dict[str, Any]])
def get_tracking(db: Session = Depends(get_db)):
    """Lista todos los registros de seguimiento de alertas enviadas."""
    service = ContractAlertsService(db)
    return service.get_tracking()


@router.get("/respond", response_class=HTMLResponse)
def respond_preview(token: str, answer: str, db: Session = Depends(get_db)):
    """Muestra página de confirmación. No guarda aún."""
    service = ContractAlertsService(db)
    result = service.preview_respond(token, answer)

    if not result.get("ok"):
        return HTMLResponse(content=_respond_html(False, error_msg=result.get("error", "Error desconocido")), status_code=400)

    record = result.get("record", {})
    if result.get("already_answered"):
        return HTMLResponse(content=_respond_html(True, already_answered=True, record=record))

    answer_label = {
        "indefinido": "Renovar - Contrato Indefinido",
        "plazo_fijo": "Renovar - Plazo Fijo",
        "no_renovar": "No Renovar",
    }.get(answer, answer)

    token_boss_email = result.get("token_boss_email", "")
    return HTMLResponse(content=_confirm_html(
        token=token, answer=answer, answer_label=answer_label,
        record=record, token_boss_email=token_boss_email,
    ))


@router.post("/respond/confirm", response_class=HTMLResponse)
async def respond_confirm(token: str, answer: str, request: Request, db: Session = Depends(get_db)):
    """Guarda la respuesta confirmada por la jefatura."""
    responder_ip = request.client.host if request.client else None
    service = ContractAlertsService(db)
    result = service.respond(token, answer, responder_ip=responder_ip)

    if not result.get("ok"):
        return HTMLResponse(content=_respond_html(False, error_msg=result.get("error", "Error desconocido")), status_code=400)

    record = result.get("record", {})
    already = result.get("already_answered", False)
    answer_label = {
        "indefinido": "Renovar - Contrato Indefinido",
        "plazo_fijo": "Renovar - Plazo Fijo",
        "no_renovar": "No Renovar",
    }.get(result.get("answer") or record.get("response"), "")

    return HTMLResponse(content=_respond_html(True, already_answered=already, answer_label=answer_label, record=record))


@router.post("/followup")
def send_followup(boss_email: Optional[str] = None, db: Session = Depends(get_db)):
    """Envía recordatorio a jefaturas sin respuesta. boss_email: filtrar a uno solo."""
    service = ContractAlertsService(db)
    return service.send_followup_emails(boss_email_filter=boss_email)


@router.post("/tracking/{tracking_id}/sync-buk", response_model=Dict[str, Any])
def sync_buk(tracking_id: int, db: Session = Depends(get_db)):
    """Sincroniza respuesta de seguimiento a BUK vía PATCH."""
    service = ContractAlertsService(db)
    result = service.sync_to_buk(tracking_id)
    if not result.get("ok"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.get("error"))
    return result


def _confirm_html(token: str, answer: str, answer_label: str, record: dict, token_boss_email: str = "") -> str:
    employee_name = record.get("employee_name", "")
    boss_name = record.get("boss_name", "")
    alert_date = record.get("alert_date", "")
    directed_to = f'<p style="color:#64748b;font-size:13px">Este link fue enviado a: <strong>{token_boss_email}</strong></p>' if token_boss_email else ""
    confirm_url = f"/api/v1/contract-alerts/respond/confirm?token={token}&answer={answer}"
    cancel_url = "javascript:window.close()"
    color = "#dc2626" if answer == "no_renovar" else "#16a34a"
    icon = "✗" if answer == "no_renovar" else "✓"
    return f"""
    <html><head><meta charset="utf-8"><title>Confirmar decisión</title></head>
    <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;
                 height:100vh;margin:0;background:#f8f9fa">
      <div style="text-align:center;padding:40px;background:white;border-radius:12px;
                  box-shadow:0 2px 10px rgba(0,0,0,.1);max-width:440px;width:90%">
        <div style="font-size:48px">{icon}</div>
        <h2 style="color:#1e293b;margin:16px 0 8px">Confirmar decisión</h2>
        <p style="color:#475569;margin:8px 0">Hola <strong>{boss_name}</strong>,</p>
        <p style="color:#475569;margin:8px 0">Estás a punto de registrar la siguiente decisión:</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:20px 0;text-align:left">
          <p style="margin:4px 0;color:#334155"><strong>Empleado:</strong> {employee_name}</p>
          <p style="margin:4px 0;color:#334155"><strong>Vencimiento:</strong> {alert_date}</p>
          <p style="margin:4px 0;color:{color};font-weight:bold"><strong>Decisión:</strong> {answer_label}</p>
        </div>
        {directed_to}
        <p style="color:#94a3b8;font-size:13px;margin-bottom:24px">Esta acción quedará registrada y no podrá modificarse. Recibirás un correo de confirmación.</p>
        <form method="post" action="{confirm_url}" style="display:inline">
          <button type="submit" style="background:{color};color:white;border:none;padding:10px 28px;
                  border-radius:6px;font-size:15px;font-weight:bold;cursor:pointer;margin-right:8px">
            Confirmar
          </button>
        </form>
        <a href="{cancel_url}" style="display:inline-block;padding:10px 28px;border:1px solid #cbd5e1;
                border-radius:6px;font-size:15px;color:#64748b;text-decoration:none">
          Cancelar
        </a>
      </div>
    </body></html>
    """


def _respond_html(
    success: bool,
    error_msg: str = "",
    already_answered: bool = False,
    answer_label: str = "",
    record: dict = None,
) -> str:
    record = record or {}
    employee_name = record.get("employee_name", "")
    alert_date = record.get("alert_date", "")

    if not success:
        return f"""
        <html><head><meta charset="utf-8"><title>Error</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;
                     height:100vh;margin:0;background:#f8f9fa">
          <div style="text-align:center;padding:40px;background:white;border-radius:12px;
                      box-shadow:0 2px 10px rgba(0,0,0,.1);max-width:400px">
            <div style="font-size:48px">❌</div>
            <h2 style="color:#dc2626;margin:16px 0 8px">Link inválido</h2>
            <p style="color:#6b7280">{error_msg}</p>
          </div>
        </body></html>
        """

    if already_answered:
        return f"""
        <html><head><meta charset="utf-8"><title>Ya respondido</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;
                     height:100vh;margin:0;background:#f8f9fa">
          <div style="text-align:center;padding:40px;background:white;border-radius:12px;
                      box-shadow:0 2px 10px rgba(0,0,0,.1);max-width:400px">
            <div style="font-size:48px">ℹ️</div>
            <h2 style="color:#2563eb;margin:16px 0 8px">Ya fue respondido</h2>
            <p style="color:#6b7280">La decisión para <strong>{employee_name}</strong> ya fue registrada anteriormente.</p>
          </div>
        </body></html>
        """

    color = "#16a34a" if "No" not in answer_label else "#dc2626"
    return f"""
    <html><head><meta charset="utf-8"><title>Respuesta registrada</title></head>
    <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;
                 height:100vh;margin:0;background:#f8f9fa">
      <div style="text-align:center;padding:40px;background:white;border-radius:12px;
                  box-shadow:0 2px 10px rgba(0,0,0,.1);max-width:400px">
        <div style="font-size:48px">✅</div>
        <h2 style="color:{color};margin:16px 0 8px">¡Respuesta registrada!</h2>
        <p style="color:#374151">Empleado: <strong>{employee_name}</strong></p>
        <p style="color:#374151">Vencimiento: <strong>{alert_date}</strong></p>
        <p style="color:{color};font-weight:bold;font-size:18px">{answer_label}</p>
        <p style="color:#9ca3af;font-size:13px;margin-top:16px">Puede cerrar esta ventana.</p>
      </div>
    </body></html>
    """
