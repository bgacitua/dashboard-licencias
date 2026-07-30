from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.security import require_role
from app.db.deps import get_db
from app.models.auth import Usuario
from app.services.overtime_service import OvertimeService

router = APIRouter()


# === Página pública (auth = el JWT del link) ===

@router.get("/respond", response_class=HTMLResponse)
def respond_form(token: str, db: Session = Depends(get_db)):
    """Formulario de selección de horas extras para la jefatura."""
    return HTMLResponse(content=OvertimeService(db).render_form(token))


@router.post("/respond/confirm", response_class=HTMLResponse)
async def respond_confirm(token: str, request: Request, db: Session = Depends(get_db)):
    """Guarda (o reemplaza) la selección de la jefatura."""
    form = await request.form()
    ip = request.client.host if request.client else None
    html = OvertimeService(db).save_response(token, dict(form), responder_ip=ip)
    return HTMLResponse(content=html)


# === Dashboard (protegido) ===

@router.get("/summary", response_model=Dict[str, Any])
def get_summary(
    week_start: Optional[date] = None,
    current_user: Usuario = Depends(require_role(["admin", "rrhh"])),
    db: Session = Depends(get_db),
):
    """Consolidado de la semana. Sin week_start usa la semana vigente."""
    return OvertimeService(db).get_summary(week_start)


@router.post("/summary/send", response_model=Dict[str, Any])
def send_summary(
    week_start: Optional[date] = None,
    current_user: Usuario = Depends(require_role(["admin", "rrhh"])),
    db: Session = Depends(get_db),
):
    """Envía el consolidado a OVERTIME_SUMMARY_TO."""
    return OvertimeService(db).send_summary(week_start)


@router.post("/send-requests", response_model=Dict[str, Any])
def send_requests(
    current_user: Usuario = Depends(require_role(["admin", "rrhh"])),
    db: Session = Depends(get_db),
):
    """Dispara manualmente el envío de solicitudes a las jefaturas."""
    return OvertimeService(db).send_weekly_requests()
