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


def _destino(real: str) -> tuple:
    """(destinatario, prefijo_asunto). Con OVERTIME_TEST_EMAIL todo se desvía a esa casilla."""
    if settings.OVERTIME_TEST_EMAIL:
        logger.warning(f"[Overtime] MODO PRUEBA — correo para {real} desviado a {settings.OVERTIME_TEST_EMAIL}")
        return settings.OVERTIME_TEST_EMAIL, f"[PRUEBA → {real}] "
    return real, ""


class OvertimeService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = OvertimeRepository(db)

    # ------------------------------------------------------------- envío
    def send_weekly_requests(self, boss_rut_filter: Optional[str] = None) -> Dict[str, Any]:
        """Agrupa trabajadores por jefe y envía a cada uno su link de selección.

        boss_rut_filter: enviar solo a esa jefatura (pruebas).
        """
        from app.services.email_token_service import AuthRequiredError

        if not settings.PUBLIC_URL:
            logger.error("[Overtime] PUBLIC_URL no configurado — no se pueden generar links.")
            return {"sent": 0, "errors": 0, "message": "PUBLIC_URL no configurado"}

        workers = self.repo.get_workers_by_boss()
        if not workers:
            return {"sent": 0, "errors": 0, "message": "Sin trabajadores con jefe/correo"}

        if boss_rut_filter:
            workers = [w for w in workers if w["boss_rut"] == boss_rut_filter]
            if not workers:
                return {"sent": 0, "errors": 0, "message": f"Sin trabajadores para el jefe {boss_rut_filter}"}

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
            destino, prefijo = _destino(boss_email)
            try:
                ok = send_email_graph(
                    to=destino,
                    cc="",
                    subject=f"{prefijo}Horas extras fin de semana {_fmt(win['sabado'])} — selección de trabajadores",
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

    def list_bosses(self) -> Dict[str, Any]:
        """Jefaturas que recibirían el correo. Sirve para revisar la query antes de enviar."""
        workers = self.repo.get_workers_by_boss()
        jefes: Dict[str, Dict[str, Any]] = {}
        for w in workers:
            j = jefes.setdefault(w["boss_rut"], {
                "boss_rut": w["boss_rut"],
                "boss_name": w.get("boss_name"),
                "boss_email": w.get("boss_email"),
                "trabajadores": 0,
            })
            j["trabajadores"] += 1
        return {
            "total_trabajadores": len(workers),
            "total_jefes": len(jefes),
            "modo_prueba": bool(settings.OVERTIME_TEST_EMAIL),
            "jefes": sorted(jefes.values(), key=lambda x: x["boss_name"] or ""),
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
        destino, prefijo = _destino(destinos[0])
        cc = "" if settings.OVERTIME_TEST_EMAIL else ";".join(destinos[1:])
        try:
            ok = send_email_graph(
                to=destino,
                cc=cc,
                subject=f"{prefijo}Consolidado horas extras fin de semana — semana del {_fmt(week_start)}",
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

_DIAS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def _fecha_larga(dt) -> str:
    """'viernes 31-07-2026 a las 15:00' (strftime('%A') devuelve inglés en el contenedor)."""
    return f"{_DIAS_ES[dt.weekday()]} {dt.strftime('%d-%m-%Y')} a las {dt.strftime('%H:%M')}"


_SHELL = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin:0;
         background:#f1f5f9; color:#0f172a; -webkit-text-size-adjust:100%; }}
  .wrap {{ max-width: 860px; margin: 0 auto; padding: 24px 16px 64px; }}
  .card {{ background:#fff; border-radius:14px; box-shadow:0 1px 3px rgba(15,23,42,.08);
           border:1px solid #e2e8f0; padding:24px; }}
  h1 {{ font-size:22px; margin:0 0 6px; letter-spacing:-.01em; }}
  .muted {{ color:#64748b; font-size:14px; margin:4px 0; }}
  table {{ width:100%; border-collapse:collapse; font-size:14px; }}
  th {{ background:#f8fafc; color:#475569; font-size:12px; text-transform:uppercase;
        letter-spacing:.04em; text-align:left; padding:10px 12px; border-bottom:1px solid #e2e8f0; }}
  td {{ padding:12px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }}
  tbody tr:hover {{ background:#f8fafc; }}
  tbody tr.on {{ background:#eff6ff; }}
  input[type=checkbox] {{ width:22px; height:22px; accent-color:#2563eb; cursor:pointer; }}
  input[type=checkbox]:disabled {{ cursor:default; opacity:.5; }}
  .btn {{ background:#2563eb; color:#fff; border:none; padding:13px 30px; border-radius:9px;
          font-size:15px; font-weight:600; cursor:pointer; }}
  .btn:hover {{ background:#1d4ed8; }}
  .search {{ width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px;
             font-size:14px; margin-top:8px; }}
  .search:focus {{ outline:2px solid #bfdbfe; outline-offset:-1px; border-color:#2563eb; }}
  .bar {{ position:sticky; top:0; z-index:5; background:#0f172a; color:#fff; border-radius:12px;
          padding:14px 18px; display:flex; gap:28px; align-items:center; flex-wrap:wrap;
          margin-bottom:16px; }}
  .bar b {{ font-size:22px; display:block; line-height:1.1; }}
  .bar span {{ font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:#94a3b8; }}
  details {{ margin-top:10px; }}
  summary {{ cursor:pointer; font-size:13px; color:#cbd5e1; }}
  .chips {{ display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }}
  .chip {{ background:#1e293b; color:#e2e8f0; border-radius:999px; padding:3px 10px; font-size:12px; }}
  .warn {{ background:#fef2f2; color:#991b1b; border:1px solid #fecaca; border-radius:8px;
           padding:12px 14px; font-size:14px; margin:14px 0; }}
  .info {{ background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:8px;
           padding:12px 14px; font-size:14px; margin:14px 0; }}
  @media (max-width:560px) {{
    .card {{ padding:16px; }}
    td, th {{ padding:10px 6px; }}
  }}
</style></head>
<body><div class="wrap">{body}</div></body></html>"""


def _page_error(msg: str) -> str:
    body = f"""
    <div class="card" style="text-align:center;padding:48px 24px">
      <div style="font-size:44px">⚠️</div>
      <h1 style="color:#b91c1c;margin:14px 0 8px">No disponible</h1>
      <p class="muted">{escape(msg)}</p>
    </div>"""
    return _SHELL.format(title="No disponible", body=body)


def _page_form(token, record, workers, selections, win, read_only: bool) -> str:
    boss_name = escape(record.get("boss_name") or "")
    deadline_txt = _fecha_larga(record["deadline"].astimezone(_tz()))
    disabled = " disabled" if read_only else ""
    total = len(workers)

    rows = ""
    for w in workers:
        rut = w["employee_rut"]
        sel = selections.get(rut, {})
        sab = " checked" if sel.get("sabado") else ""
        dom = " checked" if sel.get("domingo") else ""
        nombre = escape(w.get("employee_name") or "")
        detalle = " · ".join(x for x in (w.get("cargo"), w.get("area")) if x)
        rows += f"""
        <tr data-buscar="{nombre.lower()}">
          <td>
            <div style="font-weight:500">{nombre}</div>
            <div style="color:#64748b;font-size:12px">{escape(detalle)}</div>
          </td>
          <td style="text-align:center">
            <input type="checkbox" name="sab_{escape(rut)}" data-dia="sab" data-name="{nombre}"
                   aria-label="Sábado {nombre}"{sab}{disabled}>
          </td>
          <td style="text-align:center">
            <input type="checkbox" name="dom_{escape(rut)}" data-dia="dom" data-name="{nombre}"
                   aria-label="Domingo {nombre}"{dom}{disabled}>
          </td>
        </tr>"""

    if read_only:
        aviso = ('<div class="warn"><strong>El plazo ya se cerró.</strong> '
                 'Esta vista es solo de consulta.</div>')
        boton = ""
        buscador = ""
    else:
        aviso = (f'<div class="info">Puedes volver a este mismo link y modificar tu selección '
                 f'hasta el <strong>{deadline_txt}</strong>.</div>')
        boton = ('<div style="margin-top:22px"><button type="submit" class="btn">'
                 'Guardar selección</button></div>')
        buscador = ('<input type="search" id="q" class="search" autocomplete="off" '
                    'placeholder="Buscar trabajador por nombre…">')

    body = f"""
    <div id="resumen" class="bar"></div>

    <div class="card">
      <h1>Horas extras fin de semana</h1>
      <p class="muted">Hola <strong>{boss_name}</strong>, marca quiénes de tu equipo trabajarán el
        <strong>sábado {_fmt(win['sabado'])}</strong> y/o el
        <strong>domingo {_fmt(win['domingo'])}</strong>.</p>
      <p class="muted">{total} trabajador(es) a tu cargo.</p>
      {aviso}

      <form method="post" action="/api/v1/overtime/respond/confirm?token={token}">
        <table>
          <thead><tr>
            <th style="width:auto">Trabajador {buscador}</th>
            <th style="text-align:center;width:96px">Sábado</th>
            <th style="text-align:center;width:96px">Domingo</th>
          </tr></thead>
          <tbody id="tb">{rows}</tbody>
        </table>
        <p id="vacio" class="muted" style="display:none;padding:16px 0">
          Ningún trabajador coincide con la búsqueda.</p>
        {boton}
      </form>
    </div>

    <script>
      const box = document.getElementById('resumen');

      // La búsqueda solo oculta filas (display:none). Los checkbox siguen en el
      // formulario, así que filtrar nunca pierde una selección.
      const q = document.getElementById('q');
      if (q) {{
        q.addEventListener('input', () => {{
          const t = q.value.trim().toLowerCase();
          let visibles = 0;
          document.querySelectorAll('#tb tr').forEach(tr => {{
            const ok = !t || tr.dataset.buscar.includes(t);
            tr.style.display = ok ? '' : 'none';
            if (ok) visibles++;
          }});
          document.getElementById('vacio').style.display = visibles ? 'none' : 'block';
        }});
      }}

      function marcados(dia) {{
        return [...document.querySelectorAll('input[data-dia="' + dia + '"]:checked')]
          .map(c => c.dataset.name).sort();
      }}
      function chips(nombres) {{
        if (!nombres.length) return '<div class="muted" style="color:#64748b">Nadie seleccionado.</div>';
        return '<div class="chips">' +
          nombres.map(n => '<span class="chip">' + n + '</span>').join('') + '</div>';
      }}
      function pintar() {{
        const sab = marcados('sab'), dom = marcados('dom');
        // Contadores siempre visibles; los nombres van plegados para que no
        // se vuelva ilegible cuando el jefe tiene 20+ trabajadores.
        box.innerHTML =
          '<div><span>Sábado</span><b>' + sab.length + '</b></div>' +
          '<div><span>Domingo</span><b>' + dom.length + '</b></div>' +
          '<div style="flex:1;min-width:200px">' +
            '<details><summary>Ver nombres seleccionados</summary>' +
            '<div style="margin-top:8px"><span>Sábado</span>' + chips(sab) + '</div>' +
            '<div style="margin-top:10px"><span>Domingo</span>' + chips(dom) + '</div>' +
            '</details></div>';
        document.querySelectorAll('#tb tr').forEach(tr => {{
          const on = [...tr.querySelectorAll('input:checked')].length > 0;
          tr.classList.toggle('on', on);
        }});
      }}
      document.querySelectorAll('input[type=checkbox]').forEach(c => c.addEventListener('change', pintar));
      pintar();
    </script>"""
    return _SHELL.format(title="Horas extras fin de semana", body=body)


def _page_saved(token, record, items) -> str:
    sab = [i["employee_name"] for i in items if i["sabado"]]
    dom = [i["employee_name"] for i in items if i["domingo"]]
    back = f"/api/v1/overtime/respond?token={token}"
    cierre = _fecha_larga(record["deadline"].astimezone(_tz()))

    def _bloque(titulo, nombres):
        if not nombres:
            return f'<div style="margin-top:14px"><span>{titulo}</span><b>0</b></div>'
        chips = "".join(f'<span class="chip">{escape(n or "")}</span>' for n in sorted(nombres))
        return (f'<div style="margin-top:14px"><span>{titulo}</span><b>{len(nombres)}</b>'
                f'<div class="chips">{chips}</div></div>')

    body = f"""
    <div class="card" style="text-align:center;padding:40px 24px">
      <div style="font-size:44px">✅</div>
      <h1 style="color:#15803d;margin:14px 0 6px">Selección registrada</h1>
      <p class="muted">Puedes modificarla hasta el <strong>{cierre}</strong>.</p>
      <div class="bar" style="position:static;display:block;text-align:left;margin-top:22px">
        {_bloque('Sábado', sab)}
        {_bloque('Domingo', dom)}
      </div>
      <a href="{back}" style="display:inline-block;margin-top:18px;padding:11px 26px;
              border:1px solid #cbd5e1;border-radius:9px;color:#2563eb;text-decoration:none;
              font-weight:500">Volver a editar</a>
    </div>"""
    return _SHELL.format(title="Selección registrada", body=body)


def _request_email_html(boss_name: str, total: int, link: str, win: Dict[str, Any]) -> str:
    deadline_txt = _fecha_larga(win["deadline"])
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
