import urllib.parse
from html import escape

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

import httpx

from app.core.config import settings
from app.core.security import (
    consume_oauth_state_token,
    create_oauth_state_token,
    require_role,
)
from app.db.deps import get_db
from app.models.auth import Usuario
from app.services import web_pages as W
from app.services.contract_alerts_service import ContractAlertsService
from app.services.email_templates import C
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

# Rutas que se abren sin sesión en la plataforma. `router` se incluye en api.py
# con Depends(get_current_user); estas cuelgan de `publico`, que se incluye sin
# esa dependencia. Lo que las protege es el token firmado del enlace
# (decode_response_token) o, en el OAuth, el propio consentimiento de Microsoft.
# Solo agregar aquí una ruta que un externo DEBE poder abrir sin cuenta.
publico = APIRouter()

_SCOPES = (
    "https://graph.microsoft.com/Mail.Send "
    "https://graph.microsoft.com/Mail.Send.Shared "  # enviar desde buzones compartidos
    "offline_access"
)


# === OAuth2 Microsoft ===

# Cuelga de `router`, no de `publico`: exige sesión y rol. Quien complete este
# flujo queda como remitente de TODOS los correos automáticos de la plataforma,
# así que no puede iniciarlo un anónimo. Devuelve la URL en JSON en vez de
# redirigir porque el frontend la abre con window.open tras llamar con el header
# Authorization; un <a href> no puede mandarlo.
@router.get("/auth/login")
def microsoft_login(
    current_user: Usuario = Depends(require_role(["admin", "rrhh"])),
):
    """URL de consentimiento de Microsoft para autorizar el envío de correos."""
    params = {
        "client_id": settings.AZURE_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": settings.AZURE_REDIRECT_URI,
        "response_mode": "query",
        "scope": _SCOPES,
        "state": create_oauth_state_token(current_user.username),
    }
    auth_url = (
        f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}"
        f"/oauth2/v2.0/authorize?{urllib.parse.urlencode(params)}"
    )
    logger.info(f"OAuth de Microsoft iniciado por {current_user.username}")
    return {"auth_url": auth_url}


@publico.get("/auth/callback", response_class=HTMLResponse)
def microsoft_callback(code: str = None, error: str = None, state: str = None):
    """Recibe el código OAuth2 de Microsoft, obtiene los tokens y los guarda.

    Público por obligación: quien llega aquí es el navegador redirigido por
    Microsoft, sin el header Authorization. Lo que autoriza el canje es el
    `state` firmado que emitió /auth/login, no la sesión.
    """
    if error:
        logger.error(f"Error en callback OAuth2: {error}")
        return HTMLResponse(content=_auth_html(False, error), status_code=400)

    # Antes de tocar el código: sin un state válido, el flujo no lo inició
    # nadie de la plataforma y el token que se guardaría no es el que queremos.
    # `consume` además lo quema, para que no sirva dos veces.
    payload = consume_oauth_state_token(state) if state else None
    if payload is None:
        logger.warning("Callback OAuth2 rechazado: state ausente, invalido, expirado o ya usado")
        return HTMLResponse(
            content=_auth_html(
                False,
                "Solicitud no valida o expirada. Inicia la autorizacion de nuevo "
                "desde la plataforma.",
            ),
            status_code=400,
        )

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
        logger.info(f"Autorización de Microsoft completada por {payload.get('sub')}")
        return HTMLResponse(content=_auth_html(True))
    except Exception as e:
        logger.error(f"Error intercambiando código por token: {e}")
        return HTMLResponse(content=_auth_html(False, str(e)), status_code=500)


def _auth_html(success: bool, error_msg: str = "") -> str:
    if success:
        return W.status_page(
            "✅", "¡Autorización exitosa!",
            '<p class="muted">Ya puedes cerrar esta ventana y enviar los correos.</p>'
            "<script>setTimeout(() => window.close(), 2000)</script>",
            C.OK,
        )
    return W.status_page(
        "❌", "Error de autorización",
        f'<p class="muted">{escape(error_msg)}</p>'
        '<p class="fine">Puedes cerrar esta ventana e intentarlo de nuevo.</p>',
        C.DANGER,
    )


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
    return service.send_alerts_by_boss(request.bosses, days_override=request.days)


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
def get_tracking(
    current_user: Usuario = Depends(require_role(["admin", "rrhh"])),
    db: Session = Depends(get_db),
):
    """Lista todos los registros de seguimiento de alertas enviadas."""
    service = ContractAlertsService(db)
    return service.get_tracking()


@publico.get("/respond", response_class=HTMLResponse)
def respond_preview(token: str, answer: str, request: Request, db: Session = Depends(get_db)):
    """Muestra página de confirmación. No guarda aún."""
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    service = ContractAlertsService(db)
    result = service.preview_respond(token, answer, ip=ip, user_agent=user_agent)

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


def _auto_sync_buk(tracking_id: int) -> None:
    """
    Ejecuta la renovación en BUK tras la respuesta de la jefatura.
    Corre en background: el scraper tarda ~20s y el jefe no debe esperarlo.
    Sesión propia porque la del request ya se cerró.
    """
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        logger.info(f"[auto-sync-buk] iniciando tracking_id={tracking_id}")
        res = ContractAlertsService(db).sync_to_buk(tracking_id, trigger="auto")
        logger.info(f"[auto-sync-buk] resultado tracking_id={tracking_id}: {res}")
    except Exception as e:
        logger.error(f"[auto-sync-buk] tracking_id={tracking_id}: {e}")
    finally:
        db.close()


@publico.post("/respond/confirm", response_class=HTMLResponse)
async def respond_confirm(
    token: str,
    answer: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Guarda la respuesta confirmada por la jefatura."""
    responder_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    service = ContractAlertsService(db)
    result = service.respond(token, answer, responder_ip=responder_ip, user_agent=user_agent)

    if not result.get("ok"):
        return HTMLResponse(content=_respond_html(False, error_msg=result.get("error", "Error desconocido")), status_code=400)

    record = result.get("record", {})
    already = result.get("already_answered", False)
    final_answer = result.get("answer") or record.get("response")
    answer_label = {
        "indefinido": "Renovar - Contrato Indefinido",
        "plazo_fijo": "Renovar - Plazo Fijo",
        "no_renovar": "No Renovar",
    }.get(final_answer, "")

    # Renovación automática: solo en la primera respuesta y si es de renovación.
    if not already and final_answer in ("indefinido", "plazo_fijo") and record.get("id"):
        background_tasks.add_task(_auto_sync_buk, record["id"])
    else:
        logger.info(
            f"[auto-sync-buk] omitido: already={already} answer={final_answer} "
            f"record_id={record.get('id')}"
        )

    return HTMLResponse(content=_respond_html(True, already_answered=already, answer_label=answer_label, record=record))


@router.post("/followup")
def send_followup(
    boss_email: Optional[str] = None,
    current_user: Usuario = Depends(require_role(["admin", "rrhh"])),
    db: Session = Depends(get_db),
):
    """Envía recordatorio a jefaturas sin respuesta. boss_email: filtrar a uno solo."""
    service = ContractAlertsService(db)
    return service.send_followup_emails(boss_email_filter=boss_email)


@router.post("/tracking/{tracking_id}/sync-buk", response_model=Dict[str, Any])
def sync_buk(
    tracking_id: int,
    current_user: Usuario = Depends(require_role(["admin", "rrhh"])),
    db: Session = Depends(get_db),
):
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
    directed_to = (f'<p class="fine">Este link fue enviado a: '
                   f'<strong>{escape(token_boss_email)}</strong></p>') if token_boss_email else ""
    confirm_url = f"/api/v1/contract-alerts/respond/confirm?token={token}&answer={answer}"
    color = C.DANGER if answer == "no_renovar" else C.OK
    icon = "✗" if answer == "no_renovar" else "✓"
    cuerpo = f"""
        <p class="muted">Hola <strong>{escape(boss_name)}</strong>,</p>
        <p class="muted">Estás a punto de registrar la siguiente decisión:</p>
        <div class="datos">
          <p><strong>Empleado:</strong> {escape(employee_name)}</p>
          <p><strong>Vencimiento:</strong> {alert_date}</p>
          <p style="color:{color};font-weight:bold"><strong>Decisión:</strong> {answer_label}</p>
        </div>
        {directed_to}
        <p class="fine" style="margin-bottom:24px">Esta acción quedará registrada y no podrá
           modificarse. Recibirás un correo de confirmación.</p>
        <form method="post" action="{confirm_url}" style="display:inline">
          <button type="submit" class="btn{' danger' if answer == 'no_renovar' else ''}"
                  style="margin-right:8px">Confirmar</button>
        </form>
        <a href="javascript:window.close()" class="btn ghost">Cancelar</a>"""
    return W.status_page(icon, "Confirmar decisión", cuerpo)


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
        return W.status_page("❌", "Link inválido",
                             f'<p class="muted">{escape(error_msg)}</p>', C.DANGER)

    if already_answered:
        return W.status_page(
            "ℹ️", "Ya fue respondido",
            f'<p class="muted">La decisión para <strong>{escape(employee_name)}</strong> '
            f"ya fue registrada anteriormente.</p>",
            C.PRIMARY,
        )

    color = C.OK if "No" not in answer_label else C.DANGER
    return W.status_page(
        "✅", "¡Respuesta registrada!",
        f"""
        <div class="datos" style="text-align:center">
          <p>Empleado: <strong>{escape(employee_name)}</strong></p>
          <p>Vencimiento: <strong>{alert_date}</strong></p>
          <p style="color:{color};font-weight:bold;font-size:18px">{answer_label}</p>
        </div>
        <p class="fine">Puede cerrar esta ventana.</p>""",
        color,
    )
