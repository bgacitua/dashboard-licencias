"""Horas extras de fin de semana: solicitud semanal a cada jefe + consolidado.

Flujo:
  1. El scheduler llama a send_weekly_requests() el día configurado.
  2. Cada jefe recibe un correo con link firmado (JWT) a un formulario web.
  3. El jefe marca qué trabajadores van el sábado. Puede reeditar hasta el deadline.
     El domingo no se captura acá: se informa por correo.
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
from app.services import email_templates as T
from app.services import web_pages as W
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
            if form.get(f"sab_{rut}") is not None:
                items.append({
                    "employee_rut": rut,
                    "employee_name": w.get("employee_name"),
                    "cargo": w.get("cargo"),
                    "area": w.get("area"),
                    "sabado": True,
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

_AVISO_DOMINGO = ("Cualquier actividad programada día domingo debe ser informada vía correo "
                  "a GRUPO SERVICIOS GENERALES.")


def _fecha_larga(dt) -> str:
    """'viernes 31-07-2026 a las 15:00' (strftime('%A') devuelve inglés en el contenedor)."""
    return f"{_DIAS_ES[dt.weekday()]} {dt.strftime('%d-%m-%Y')} a las {dt.strftime('%H:%M')}"


def _page_error(msg: str) -> str:
    return W.status_page("⚠️", "No disponible",
                         f'<p class="muted">{escape(msg)}</p>', T.C.DANGER_TEXT)


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
        </tr>"""

    if read_only:
        aviso = ('<div class="warn"><strong>El plazo ya se cerró.</strong> '
                 'Esta vista es solo de consulta.</div>')
        boton = ""
        buscador = ""
        limpiar = ""
    else:
        aviso = (f'<div class="info">Puedes volver a este mismo link y modificar tu selección '
                 f'hasta el <strong>{deadline_txt}</strong>.</div>')
        boton = ('<div style="margin-top:22px"><button type="submit" class="btn">'
                 'Guardar selección</button></div>')
        buscador = ('<input type="search" id="q" class="search" autocomplete="off" '
                    'placeholder="Buscar trabajador por nombre…">')
        limpiar = ('<button type="button" id="limpiar" class="link-btn">'
                   'Limpiar selección</button>')

    body = f"""
    <div class="bar">
      <div id="resumen" style="display:flex;gap:28px;align-items:center;flex-wrap:wrap;flex:1"></div>
      {limpiar}
    </div>

    <div class="card">
      <h1>Horas extras fin de semana</h1>
      <p class="muted">Hola <strong>{boss_name}</strong>, marca quiénes de tu equipo trabajarán el
        <strong>sábado {_fmt(win['sabado'])}</strong>.</p>
      <p class="muted">{total} trabajador(es) a tu cargo.</p>
      <div class="warn">{_AVISO_DOMINGO}</div>
      {aviso}

      <form method="post" action="/api/v1/overtime/respond/confirm?token={token}">
        <table>
          <thead><tr>
            <th style="width:auto">Trabajador {buscador}</th>
            <th style="text-align:center;width:110px">Sábado</th>
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
        const sab = marcados('sab');
        // Contador siempre visible; los nombres van plegados para que no
        // se vuelva ilegible cuando el jefe tiene 20+ trabajadores.
        box.innerHTML =
          '<div><span>Sábado</span><b>' + sab.length + '</b></div>' +
          '<div style="flex:1;min-width:200px">' +
            '<details><summary>Ver nombres seleccionados</summary>' +
            '<div style="margin-top:8px">' + chips(sab) + '</div>' +
            '</details></div>';
        document.querySelectorAll('#tb tr').forEach(tr => {{
          const on = [...tr.querySelectorAll('input:checked')].length > 0;
          tr.classList.toggle('on', on);
        }});
        const lb = document.getElementById('limpiar');
        if (lb) lb.disabled = sab.length === 0;
      }}
      document.querySelectorAll('input[type=checkbox]').forEach(c => c.addEventListener('change', pintar));

      // Desmarca todo. No guarda: hay que pulsar "Guardar selección" para que quede en la base.
      const limpiarBtn = document.getElementById('limpiar');
      if (limpiarBtn) {{
        limpiarBtn.addEventListener('click', () => {{
          const n = document.querySelectorAll('#tb input:checked').length;
          if (!n) return;
          if (!confirm('¿Desmarcar los ' + n + ' registros seleccionados?')) return;
          document.querySelectorAll('#tb input:checked').forEach(c => c.checked = false);
          pintar();
        }});
      }}

      pintar();
    </script>"""
    return W.page("Horas extras fin de semana", body)


def _page_saved(token, record, items) -> str:
    sab = [i["employee_name"] for i in items if i["sabado"]]
    back = f"/api/v1/overtime/respond?token={token}"
    cierre = _fecha_larga(record["deadline"].astimezone(_tz()))

    def _bloque(titulo, nombres):
        if not nombres:
            return f'<div style="margin-top:14px"><span>{titulo}</span><b>0</b></div>'
        chips = "".join(f'<span class="chip">{escape(n or "")}</span>' for n in sorted(nombres))
        return (f'<div style="margin-top:14px"><span>{titulo}</span><b>{len(nombres)}</b>'
                f'<div class="chips">{chips}</div></div>')

    detalle = f"""
      <p class="muted">Puedes modificarla hasta el <strong>{cierre}</strong>.</p>
      <p class="muted">Si no tienes más cambios, cierra esta pestaña.</p>
      <div class="bar" style="position:static;display:block;text-align:left;margin-top:22px">
        {_bloque('Sábado', sab)}
      </div>
      <div class="warn" style="margin-top:16px">{_AVISO_DOMINGO}</div>
      <p style="margin-top:18px"><a href="{back}" class="btn ghost">Volver a editar</a></p>"""
    body = W.card('<span class="rocket" role="img" aria-label="Enviado">🚀</span>',
                  "Selección registrada", detalle, T.C.OK)
    return W.page("Selección registrada", body, narrow=True)


def _request_email_html(boss_name: str, total: int, link: str, win: Dict[str, Any]) -> str:
    deadline_txt = _fecha_larga(win["deadline"])
    body = f"""
      <p style="{T.P}">Hola <strong>{escape(boss_name)}</strong>,</p>
      <p style="{T.P}">Necesitamos que indiques qué trabajadores de tu equipo harán horas
         extras el <strong>sábado {_fmt(win['sabado'])}</strong>.</p>
      <p style="{T.P}">Tienes {total} trabajador(es) a cargo. Ingresa al siguiente link,
         marca a quiénes corresponda y guarda:</p>
      <div style="margin:22px 0">{T.button(link, "Seleccionar trabajadores")}</div>
      {T.callout(f'<strong>El link se cierra el {deadline_txt}.</strong> Puedes entrar las '
                 'veces que necesites y modificar tu selección hasta esa hora.', 'warn')}
      {T.callout(f'<strong>{_AVISO_DOMINGO}</strong>')}"""
    return T.email_shell("Horas extras fin de semana", body)


def _summary_email_html(week_start: date, rows: List[Dict[str, Any]]) -> str:
    sabado = week_start + timedelta(days=5)
    seleccionados = [r for r in rows if r.get("employee_rut")]
    sin_respuesta = sorted({
        r["boss_name"] or r["boss_rut"] for r in rows if not r.get("responded_at")
    })

    filas = ""
    for r in seleccionados:
        filas += f"""
        <tr>
          <td style="{T.TD}">{escape(r.get('employee_name') or '')}</td>
          <td style="{T.TD}">{escape(r.get('employee_rut') or '')}</td>
          <td style="{T.TD}">{escape(r.get('cargo') or '')}</td>
          <td style="{T.TD}">{escape(r.get('area') or '')}</td>
          <td style="{T.TD}">{escape(r.get('boss_name') or '')}</td>
        </tr>"""

    if not filas:
        filas = (f'<tr><td colspan="5" style="{T.TD};color:{T.C.MUTED}">'
                 'Ningún trabajador fue seleccionado.</td></tr>')

    pendientes = ""
    if sin_respuesta:
        pendientes = T.callout(
            "<strong>Jefaturas sin responder:</strong> " + escape(", ".join(sin_respuesta)),
            "warn",
        )

    total_sab = sum(1 for r in seleccionados if r["sabado"])

    body = f"""
      <p style="{T.H2}">Sábado {_fmt(sabado)}</p>
      <p style="{T.P}"><strong>Sábado:</strong> {total_sab} trabajador(es)</p>
      {pendientes}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="{T.TABLE}">
        <thead><tr>
          <th style="{T.TH}">Trabajador</th>
          <th style="{T.TH}">RUT</th>
          <th style="{T.TH}">Cargo</th>
          <th style="{T.TH}">Área</th>
          <th style="{T.TH}">Jefatura</th>
        </tr></thead>
        <tbody>{filas}</tbody>
      </table>"""
    return T.email_shell("Consolidado horas extras", body)
