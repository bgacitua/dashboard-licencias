"""Horas extras de fin de semana: solicitud semanal a cada jefe + consolidado.

Flujo:
  1. El scheduler llama a send_weekly_requests() el día configurado.
  2. Cada jefe recibe un correo con link firmado (JWT) a un formulario web.
  3. El jefe marca sábado/domingo por trabajador. Puede reeditar hasta el deadline.
  4. Al cerrar el plazo, send_summary() manda el consolidado a OVERTIME_SUMMARY_TO.
"""

from datetime import date, datetime, timedelta
from html import escape
from typing import Any, Dict, List, Optional

from pytz import timezone
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging_config import logger
from app.core.security import create_overtime_token, decode_overtime_token
from app.repositories.overtime_repository import OvertimeRepository
from app.services.email_service import send_email_graph

_DAYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


def _tz():
    return timezone(settings.ALERTS_SCHEDULER_TIMEZONE)


def week_window(now: Optional[datetime] = None) -> Dict[str, Any]:
    """Semana vigente y fecha de cierre.

    week_start = lunes de la semana de `now`. Si el deadline de esa semana ya pasó,
    se toma la semana siguiente (evita crear solicitudes muertas al reenviar tarde).
    """
    now = now or datetime.now(_tz())
    week_start = now.date() - timedelta(days=now.weekday())
    deadline_dow = _DAYS.get(settings.OVERTIME_DEADLINE_DAY.lower(), 4)

    def _deadline(ws: date) -> datetime:
        naive = datetime.combine(
            ws + timedelta(days=deadline_dow),
            datetime.min.time(),
        ).replace(
            hour=settings.OVERTIME_DEADLINE_HOUR,
            minute=settings.OVERTIME_DEADLINE_MINUTE,
        )
        return _tz().localize(naive)

    deadline = _deadline(week_start)
    if deadline <= now:
        week_start += timedelta(days=7)
        deadline = _deadline(week_start)

    return {
        "week_start": week_start,
        "deadline": deadline,
        "sabado": week_start + timedelta(days=5),
        "domingo": week_start + timedelta(days=6),
    }


def _fmt(d: date) -> str:
    return d.strftime("%d-%m-%Y")


class OvertimeService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = OvertimeRepository(db)

    # ------------------------------------------------------------- envío
    def send_weekly_requests(self) -> Dict[str, Any]:
        """Agrupa trabajadores por jefe y envía a cada uno su link de selección."""
        from app.services.email_token_service import AuthRequiredError

        if not settings.PUBLIC_URL:
            logger.error("[Overtime] PUBLIC_URL no configurado — no se pueden generar links.")
            return {"sent": 0, "errors": 0, "message": "PUBLIC_URL no configurado"}

        workers = self.repo.get_workers_by_boss()
        if not workers:
            return {"sent": 0, "errors": 0, "message": "Sin trabajadores con jefe/correo"}

        win = week_window()
        by_boss: Dict[str, List[Dict[str, Any]]] = {}
        for w in workers:
            by_boss.setdefault(w["boss_rut"], []).append(w)

        expires_in = win["deadline"] - datetime.now(_tz())
        sent = errors = 0

        for boss_rut, items in by_boss.items():
            boss_name = items[0].get("boss_name") or ""
            boss_email = items[0]["boss_email"]
            token = create_overtime_token(
                boss_rut=boss_rut,
                boss_email=boss_email,
                week_start=str(win["week_start"]),
                expires_in=expires_in,
            )
            request_id = self.repo.create_request(
                week_start=win["week_start"],
                boss_rut=boss_rut,
                boss_name=boss_name,
                boss_email=boss_email,
                token=token,
                deadline=win["deadline"],
            )
            if not request_id:
                errors += 1
                continue

            link = f"{settings.PUBLIC_URL}/api/v1/overtime/respond?token={token}"
            html = _request_email_html(boss_name, len(items), link, win)
            try:
                ok = send_email_graph(
                    to=boss_email,
                    cc="",
                    subject=f"Horas extras fin de semana {_fmt(win['sabado'])} — selección de trabajadores",
                    html_body=html,
                )
            except AuthRequiredError:
                logger.error("[Overtime] Token Microsoft expirado — envío cancelado.")
                return {"sent": sent, "errors": errors, "auth_required": True}

            sent += 1 if ok else 0
            errors += 0 if ok else 1

        logger.info(f"[Overtime] Solicitudes enviadas: {sent}, errores: {errors}")
        return {
            "sent": sent,
            "errors": errors,
            "week_start": str(win["week_start"]),
            "deadline": win["deadline"].strftime("%d-%m-%Y %H:%M"),
        }

    # ---------------------------------------------------------- formulario
    def _load(self, token: str) -> Dict[str, Any]:
        """Valida token + solicitud. Retorna {'ok', 'error', 'expired', 'request', 'workers'}."""
        payload = decode_overtime_token(token)
        record = self.repo.get_by_token(token)
        if not record:
            return {"ok": False, "error": "Link inválido o no encontrado."}

        expired = payload is None or record["deadline"] <= datetime.now(_tz())
        workers = [
            w for w in self.repo.get_workers_by_boss()
            if w["boss_rut"] == record["boss_rut"]
        ]
        return {"ok": True, "expired": expired, "request": record, "workers": workers}

    def render_form(self, token: str) -> str:
        data = self._load(token)
        if not data.get("ok"):
            return _page_error(data.get("error", "Error desconocido"))

        record = data["request"]
        selections = {s["employee_rut"]: s for s in self.repo.get_selections(record["id"])}
        win = {
            "week_start": record["week_start"],
            "deadline": record["deadline"],
            "sabado": record["week_start"] + timedelta(days=5),
            "domingo": record["week_start"] + timedelta(days=6),
        }
        return _page_form(
            token=token,
            record=record,
            workers=data["workers"],
            selections=selections,
            win=win,
            read_only=data["expired"],
        )

    def save_response(self, token: str, form: Dict[str, str], responder_ip: str = None) -> str:
        data = self._load(token)
        if not data.get("ok"):
            return _page_error(data.get("error", "Error desconocido"))

        record = data["request"]
        if data["expired"]:
            return _page_error(
                "El plazo para registrar horas extras de esta semana ya se cerró. "
                "Contacta a RRHH si necesitas hacer cambios."
            )

        items = []
        for w in data["workers"]:
            rut = w["employee_rut"]
            sabado = form.get(f"sab_{rut}") is not None
            domingo = form.get(f"dom_{rut}") is not None
            if sabado or domingo:
                items.append({
                    "employee_rut": rut,
                    "employee_name": w.get("employee_name"),
                    "cargo": w.get("cargo"),
                    "area": w.get("area"),
                    "sabado": sabado,
                    "domingo": domingo,
                })

        if not self.repo.save_selections(record["id"], items, responder_ip):
            return _page_error("No se pudo guardar la respuesta. Intenta nuevamente.")

        return _page_saved(token, record, items)

    # --------------------------------------------------------- consolidado
    def get_summary(self, week_start: Optional[date] = None) -> Dict[str, Any]:
        week_start = week_start or week_window()["week_start"]
        rows = self.repo.get_week_summary(week_start)
        return {"week_start": str(week_start), "rows": rows}

    def send_summary(self, week_start: Optional[date] = None) -> Dict[str, Any]:
        from app.services.email_token_service import AuthRequiredError

        if not settings.OVERTIME_SUMMARY_TO:
            logger.warning("[Overtime] OVERTIME_SUMMARY_TO no configurado — sin envío.")
            return {"sent": False, "message": "OVERTIME_SUMMARY_TO no configurado"}

        week_start = week_start or week_window()["week_start"]
        rows = self.repo.get_week_summary(week_start)
        if not rows:
            return {"sent": False, "message": f"Sin solicitudes para la semana {week_start}"}

        destinos = [d.strip() for d in settings.OVERTIME_SUMMARY_TO.split(";") if d.strip()]
        html = _summary_email_html(week_start, rows)
        try:
            ok = send_email_graph(
                to=destinos[0],
                cc=";".join(destinos[1:]),
                subject=f"Consolidado horas extras fin de semana — semana del {_fmt(week_start)}",
                html_body=html,
            )
        except AuthRequiredError:
            logger.error("[Overtime] Token Microsoft expirado — consolidado no enviado.")
            return {"sent": False, "auth_required": True}

        seleccionados = [r for r in rows if r.get("employee_rut")]
        logger.info(f"[Overtime] Consolidado semana {week_start} enviado={ok}, filas={len(seleccionados)}")
        return {"sent": ok, "week_start": str(week_start), "total": len(seleccionados)}


# ============================================================================
# HTML (f-strings, mismo patrón que contract_alerts)
# ============================================================================

_SHELL = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title></head>
<body style="font-family:system-ui,sans-serif;margin:0;background:#f8f9fa;color:#1e293b">
<div style="max-width:820px;margin:0 auto;padding:24px 16px">{body}</div>
</body></html>"""


def _page_error(msg: str) -> str:
    body = f"""
    <div style="background:white;border-radius:12px;padding:40px;text-align:center;
                box-shadow:0 2px 10px rgba(0,0,0,.08)">
      <div style="font-size:48px">⚠️</div>
      <h2 style="color:#dc2626;margin:16px 0 8px">No disponible</h2>
      <p style="color:#6b7280">{escape(msg)}</p>
    </div>"""
    return _SHELL.format(title="No disponible", body=body)


def _page_form(token, record, workers, selections, win, read_only: bool) -> str:
    boss_name = escape(record.get("boss_name") or "")
    deadline_txt = record["deadline"].astimezone(_tz()).strftime("%A %d-%m-%Y a las %H:%M")
    disabled = " disabled" if read_only else ""

    rows = ""
    for w in workers:
        rut = w["employee_rut"]
        sel = selections.get(rut, {})
        sab = " checked" if sel.get("sabado") else ""
        dom = " checked" if sel.get("domingo") else ""
        nombre = escape(w.get("employee_name") or "")
        rows += f"""
        <tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:10px 8px">{nombre}<br>
            <span style="color:#64748b;font-size:12px">{escape(w.get('cargo') or '')} · {escape(w.get('area') or '')}</span>
          </td>
          <td style="padding:10px 8px;text-align:center">
            <input type="checkbox" name="sab_{escape(rut)}" data-dia="sab" data-name="{nombre}"
                   style="width:20px;height:20px"{sab}{disabled}>
          </td>
          <td style="padding:10px 8px;text-align:center">
            <input type="checkbox" name="dom_{escape(rut)}" data-dia="dom" data-name="{nombre}"
                   style="width:20px;height:20px"{dom}{disabled}>
          </td>
        </tr>"""

    if read_only:
        aviso = ('<p style="color:#dc2626;font-weight:bold">El plazo ya se cerró. '
                 'Esta vista es solo de consulta.</p>')
        boton = ""
    else:
        aviso = (f'<p style="color:#475569">Puedes volver a este mismo link y modificar tu '
                 f'selección hasta el <strong>{deadline_txt}</strong>.</p>')
        boton = """
        <button type="submit" style="background:#2563eb;color:white;border:none;padding:12px 32px;
                border-radius:8px;font-size:16px;font-weight:bold;cursor:pointer;margin-top:20px">
          Guardar selección
        </button>"""

    body = f"""
    <div style="background:white;border-radius:12px;padding:28px;box-shadow:0 2px 10px rgba(0,0,0,.08)">
      <h2 style="margin:0 0 8px">Horas extras fin de semana</h2>
      <p style="color:#475569;margin:4px 0">Hola <strong>{boss_name}</strong>, marca quiénes de tu equipo
      trabajarán el <strong>sábado {_fmt(win['sabado'])}</strong> y/o el
      <strong>domingo {_fmt(win['domingo'])}</strong>.</p>
      {aviso}

      <div id="resumen" style="background:#f1f5f9;border-radius:8px;padding:16px;margin:20px 0"></div>

      <form method="post" action="/api/v1/overtime/respond/confirm?token={token}">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead><tr style="background:#e2e8f0;text-align:left">
            <th style="padding:10px 8px">Trabajador</th>
            <th style="padding:10px 8px;text-align:center;width:110px">Sábado</th>
            <th style="padding:10px 8px;text-align:center;width:110px">Domingo</th>
          </tr></thead>
          <tbody>{rows}</tbody>
        </table>
        {boton}
      </form>
    </div>
    <script>
      const box = document.getElementById('resumen');
      function lista(dia) {{
        return [...document.querySelectorAll('input[data-dia="' + dia + '"]:checked')]
          .map(c => c.dataset.name);
      }}
      function pintar() {{
        const sab = lista('sab'), dom = lista('dom');
        box.innerHTML =
          '<strong>Sábado: ' + sab.length + ' trabajador(es)</strong><div style="color:#475569;font-size:13px;margin:4px 0 12px">'
          + (sab.join(', ') || 'nadie seleccionado') + '</div>'
          + '<strong>Domingo: ' + dom.length + ' trabajador(es)</strong><div style="color:#475569;font-size:13px;margin-top:4px">'
          + (dom.join(', ') || 'nadie seleccionado') + '</div>';
      }}
      document.querySelectorAll('input[type=checkbox]').forEach(c => c.addEventListener('change', pintar));
      pintar();
    </script>"""
    return _SHELL.format(title="Horas extras fin de semana", body=body)


def _page_saved(token, record, items) -> str:
    sab = [i["employee_name"] for i in items if i["sabado"]]
    dom = [i["employee_name"] for i in items if i["domingo"]]
    back = f"/api/v1/overtime/respond?token={token}"
    body = f"""
    <div style="background:white;border-radius:12px;padding:40px;text-align:center;
                box-shadow:0 2px 10px rgba(0,0,0,.08)">
      <div style="font-size:48px">✅</div>
      <h2 style="color:#16a34a;margin:16px 0 8px">Selección registrada</h2>
      <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:20px 0;text-align:left">
        <p style="margin:4px 0"><strong>Sábado ({len(sab)}):</strong> {escape(', '.join(sab) or 'nadie')}</p>
        <p style="margin:4px 0"><strong>Domingo ({len(dom)}):</strong> {escape(', '.join(dom) or 'nadie')}</p>
      </div>
      <p style="color:#64748b;font-size:14px">Puedes modificarla hasta el cierre del plazo.</p>
      <a href="{back}" style="display:inline-block;margin-top:12px;padding:10px 24px;border:1px solid #cbd5e1;
              border-radius:8px;color:#2563eb;text-decoration:none">Volver a editar</a>
    </div>"""
    return _SHELL.format(title="Selección registrada", body=body)


def _request_email_html(boss_name: str, total: int, link: str, win: Dict[str, Any]) -> str:
    deadline_txt = win["deadline"].strftime("%d-%m-%Y a las %H:%M")
    return f"""
    <div style="font-family:sans-serif;color:#1e293b">
      <p>Hola <strong>{escape(boss_name)}</strong>,</p>
      <p>Necesitamos que indiques qué trabajadores de tu equipo harán horas extras este fin de semana
         (<strong>sábado {_fmt(win['sabado'])}</strong> y <strong>domingo {_fmt(win['domingo'])}</strong>).</p>
      <p>Tienes {total} trabajador(es) a cargo. Ingresa al siguiente link, marca los días y guarda:</p>
      <p style="margin:24px 0">
        <a href="{link}" style="background:#2563eb;color:white;padding:12px 28px;border-radius:6px;
           text-decoration:none;font-weight:bold">Seleccionar trabajadores</a>
      </p>
      <p style="color:#dc2626"><strong>El link se cierra el {deadline_txt}.</strong>
         Puedes entrar las veces que necesites y modificar tu selección hasta esa hora.</p>
      <p style="color:#94a3b8;font-size:12px">Correo automático — Dashboard de Personas.</p>
    </div>"""


def _summary_email_html(week_start: date, rows: List[Dict[str, Any]]) -> str:
    sabado = week_start + timedelta(days=5)
    domingo = week_start + timedelta(days=6)
    seleccionados = [r for r in rows if r.get("employee_rut")]
    sin_respuesta = sorted({
        r["boss_name"] or r["boss_rut"] for r in rows if not r.get("responded_at")
    })

    filas = ""
    for r in seleccionados:
        dias = ", ".join(d for d, on in (("Sábado", r["sabado"]), ("Domingo", r["domingo"])) if on)
        filas += f"""
        <tr>
          <td style="padding:8px;border:1px solid #e2e8f0">{escape(r.get('employee_name') or '')}</td>
          <td style="padding:8px;border:1px solid #e2e8f0">{escape(r.get('employee_rut') or '')}</td>
          <td style="padding:8px;border:1px solid #e2e8f0">{escape(r.get('cargo') or '')}</td>
          <td style="padding:8px;border:1px solid #e2e8f0">{escape(r.get('area') or '')}</td>
          <td style="padding:8px;border:1px solid #e2e8f0">{escape(r.get('boss_name') or '')}</td>
          <td style="padding:8px;border:1px solid #e2e8f0"><strong>{dias}</strong></td>
        </tr>"""

    if not filas:
        filas = ('<tr><td colspan="6" style="padding:12px;border:1px solid #e2e8f0;color:#64748b">'
                 'Ningún trabajador fue seleccionado.</td></tr>')

    pendientes = ""
    if sin_respuesta:
        pendientes = (
            '<p style="color:#dc2626"><strong>Jefaturas sin responder:</strong> '
            + escape(", ".join(sin_respuesta)) + "</p>"
        )

    total_sab = sum(1 for r in seleccionados if r["sabado"])
    total_dom = sum(1 for r in seleccionados if r["domingo"])

    return f"""
    <div style="font-family:sans-serif;color:#1e293b">
      <h2>Horas extras fin de semana — {_fmt(sabado)} / {_fmt(domingo)}</h2>
      <p><strong>Sábado:</strong> {total_sab} trabajador(es) &nbsp;·&nbsp;
         <strong>Domingo:</strong> {total_dom} trabajador(es)</p>
      {pendientes}
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px">
        <thead><tr style="background:#e2e8f0">
          <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Trabajador</th>
          <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">RUT</th>
          <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Cargo</th>
          <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Área</th>
          <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Jefatura</th>
          <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Días</th>
        </tr></thead>
        <tbody>{filas}</tbody>
      </table>
      <p style="color:#94a3b8;font-size:12px">Correo automático — Dashboard de Personas.</p>
    </div>"""
