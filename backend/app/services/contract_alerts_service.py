"""
Servicio de alertas de contratos.
Gestiona la lógica de negocio: obtención de alertas, agrupación por jefe,
generación de HTML para emails y envío vía Outlook COM.
Incluye calendario dinámico de cierres mensual.
"""

from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, date, timedelta
import calendar
from app.repositories.contract_alerts_repository import ContractAlertsRepository
from app.repositories.tracking_repository import TrackingRepository
from app.core.logging_config import logger


class ContractAlertsService:
    def __init__(self, db: Session):
        self.repository = ContractAlertsRepository(db)
        self.tracking = TrackingRepository(db)

    # ================================================================
    # Cálculo de rango dinámico
    # ================================================================

    def _calculate_search_range(self) -> Tuple[date, date, str, Optional[date], Optional[int]]:
        """
        Calcula el rango de búsqueda dinámico basado en el calendario de cierres.
        
        Lógica:
        - Normal: hoy → hoy + 9 días
        - Cerca del cierre (≤7 días antes): hoy → último día del mes
        
        Returns: (fecha_inicio, fecha_fin, modo, fecha_cierre, dias_al_cierre)
        """
        hoy = date.today()
        mes_actual = hoy.month
        anio_actual = hoy.year

        # Buscar cierre del mes actual
        cierre = self.repository.get_cierre_by_month(anio_actual, mes_actual)

        if cierre:
            fecha_cierre = cierre["fecha_cierre"]
            if isinstance(fecha_cierre, str):
                fecha_cierre = datetime.strptime(fecha_cierre, "%Y-%m-%d").date()
            
            dias_al_cierre = (fecha_cierre - hoy).days

            if 0 <= dias_al_cierre <= 7:
                # Modo cierre: buscar hasta fin de mes
                ultimo_dia = calendar.monthrange(anio_actual, mes_actual)[1]
                fecha_fin = date(anio_actual, mes_actual, ultimo_dia)
                logger.info(f"Modo CIERRE: {dias_al_cierre} días al cierre ({fecha_cierre}). Rango: {hoy} → {fecha_fin}")
                return hoy, fecha_fin, "cierre", fecha_cierre, dias_al_cierre
            else:
                # Modo normal: buscar 9 días adelante (incluye días post-cierre con dias_al_cierre < 0)
                fecha_fin = hoy + timedelta(days=9)
                logger.info(f"Modo NORMAL: {dias_al_cierre} días al cierre ({fecha_cierre}). Rango: {hoy} → {fecha_fin}")
                return hoy, fecha_fin, "normal", fecha_cierre, dias_al_cierre
        else:
            # Sin cierre configurado: usar 9 días por defecto
            fecha_fin = hoy + timedelta(days=9)
            logger.info(f"Sin cierre configurado para {mes_actual}/{anio_actual}. Rango: {hoy} → {fecha_fin}")
            return hoy, fecha_fin, "normal", None, None

    # ================================================================
    # Alertas
    # ================================================================

    def _get_end_date(self, days_override: Optional[int] = None) -> date:
        """Calcula la fecha fin: usa override manual si existe, sino el rango dinámico."""
        if days_override and days_override > 0:
            end = date.today() + timedelta(days=days_override)
            logger.info(f"Override manual: buscando {days_override} días adelante (hasta {end})")
            return end
        _, fecha_fin, _, _, _ = self._calculate_search_range()
        return fecha_fin

    def get_alerts(self, days_override: Optional[int] = None) -> List[Dict[str, Any]]:
        """Obtiene alertas pendientes. days_override sobreescribe el rango automático."""
        fecha_fin = self._get_end_date(days_override)
        logger.info(f"Obteniendo alertas (hasta: {fecha_fin})")
        return self.repository.get_pending_alerts(end_date=fecha_fin)

    def get_alerts_grouped_by_boss(self, days_override: Optional[int] = None) -> List[Dict[str, Any]]:
        """Obtiene alertas agrupadas por jefe con conteo de empleados"""
        fecha_fin = self._get_end_date(days_override)
        alerts = self.repository.get_pending_alerts(end_date=fecha_fin)

        if not alerts:
            return []

        # Agrupar por jefe
        groups = {}
        for alert in alerts:
            key = (alert["boss_name"], alert["boss_email"], alert.get("boss_of_boss_email", ""))
            if key not in groups:
                groups[key] = {
                    "boss_name": alert["boss_name"],
                    "boss_email": alert["boss_email"],
                    "boss_of_boss_email": alert.get("boss_of_boss_email", ""),
                    "employee_count": 0,
                    "employees": []
                }
            groups[key]["employee_count"] += 1
            groups[key]["employees"].append(alert)

        return list(groups.values())

    def get_schedule_info(self) -> Dict[str, Any]:
        """Retorna información del rango de búsqueda actual"""
        fecha_inicio, fecha_fin, modo, fecha_cierre, dias_al_cierre = self._calculate_search_range()
        return {
            "fecha_inicio": fecha_inicio.strftime("%d-%m-%Y"),
            "fecha_fin": fecha_fin.strftime("%d-%m-%Y"),
            "dias_rango": (fecha_fin - fecha_inicio).days,
            "fecha_cierre_mes": fecha_cierre.strftime("%d-%m-%Y") if fecha_cierre else None,
            "dias_al_cierre": dias_al_cierre,
            "modo": modo,
        }

    def get_stats(self, days_override: Optional[int] = None) -> Dict[str, Any]:
        """Obtiene métricas resumen de las alertas pendientes"""
        fecha_fin = self._get_end_date(days_override)
        alerts = self.repository.get_pending_alerts(end_date=fecha_fin)

        segundo_plazo = sum(1 for a in alerts if a.get("alert_type") == "SEGUNDO_PLAZO")
        indefinido = sum(1 for a in alerts if a.get("alert_type") == "INDEFINIDO")
        bosses = len(set(a.get("boss_name", "") for a in alerts))

        return {
            "total_alerts": len(alerts),
            "segundo_plazo_count": segundo_plazo,
            "indefinido_count": indefinido,
            "bosses_to_notify": bosses,
        }

    def send_alerts_by_boss(self, bosses_filter: List[Dict[str, str]]) -> Dict[str, Any]:
        """
        Envía alertas agrupadas por jefe vía Outlook COM.
        bosses_filter: [{"boss_name": "...", "boss_email": "..."}]
        """
        _, fecha_fin, _, _, _ = self._calculate_search_range()
        alerts = self.repository.get_pending_alerts(end_date=fecha_fin)
        incidencias = self.repository.get_all_incidencias()

        if not alerts:
            return {
                "bosses_successful": 0,
                "bosses_failed": 0,
                "alerts_sent": 0,
                "alerts_failed": 0,
                "message": "No hay alertas pendientes para enviar.",
            }

        # Filtrar alertas pendientes verificando en BD (una sola consulta batch)
        ruts = list({a["employee_rut"] for a in alerts})
        cache_alertas = self.repository.get_alert_types_and_processed_batch(ruts)
        alertas_pendientes = []
        for alert in alerts:
            rut = alert["employee_rut"]
            info = cache_alertas.get(rut, {})
            tipo_alerta = info.get("alert_type")
            processed = info.get("processed", True)
            if tipo_alerta and not processed:
                alertas_pendientes.append(alert)

        if not alertas_pendientes:
            return {
                "bosses_successful": 0,
                "bosses_failed": 0,
                "alerts_sent": 0,
                "alerts_failed": 0,
                "message": "Todas las alertas ya han sido procesadas.",
            }

        # Aplicar filtro de jefes seleccionados
        if bosses_filter:
            bosses_tuple = [(d["boss_name"], d["boss_email"]) for d in bosses_filter]
            alertas_pendientes = [
                a for a in alertas_pendientes
                if (a["boss_name"], a["boss_email"]) in bosses_tuple
            ]

        if not alertas_pendientes:
            return {
                "bosses_successful": 0,
                "bosses_failed": 0,
                "alerts_sent": 0,
                "alerts_failed": 0,
                "message": "Los jefes seleccionados no tienen alertas pendientes.",
            }

        # Agrupar por jefe
        alertas_por_jefe = {}
        for alert in alertas_pendientes:
            key = (alert["boss_name"], alert["boss_email"], alert.get("boss_of_boss_email", ""))
            if key not in alertas_por_jefe:
                alertas_por_jefe[key] = []
            alertas_por_jefe[key].append(alert)

        # Contadores
        jefes_exitosos = 0
        jefes_con_error = 0
        alertas_enviadas = 0
        alertas_con_error = 0
        detalle_enviados = []   # [{boss_name, boss_email, empleados: [{nombre, cargo, fecha_alerta}]}]
        detalle_errores = []    # [{boss_name, boss_email}]

        from app.services.email_token_service import AuthRequiredError
        from app.core.config import settings

        # Procesar cada jefe
        try:
            for (nombre_jefe, email_jefe, email_jefe_jefe), empleados_list in alertas_por_jefe.items():
                logger.info(f"Procesando jefe: {nombre_jefe} ({email_jefe})")

                empleados_jefe = []
                ruts_procesados = []
                token_map: Dict[str, str] = {}  # rut -> response_token UUID

                for emp in empleados_list:
                    rut = emp["employee_rut"]
                    tipo_alerta = cache_alertas.get(rut, {}).get("alert_type")
                    if tipo_alerta:
                        empleados_jefe.append({
                            "empleado": emp["employee_name"],
                            "rut": rut,
                            "cargo": emp.get("employee_role", "N/A"),
                            "email": emp.get("email", "N/A"),
                            "fecha_alerta": emp.get("alert_date", "N/A"),
                            "motivo": emp.get("alert_reason", "N/A"),
                            "tipo_alerta": tipo_alerta,
                        })
                        ruts_procesados.append((rut, tipo_alerta))
                        # Upsert tracking y obtener token
                        token = self.tracking.upsert_tracking(
                            employee_id=emp.get("employee_id", 0),
                            rut=rut,
                            employee_name=emp.get("employee_name", ""),
                            employee_role=emp.get("employee_role", ""),
                            boss_name=nombre_jefe,
                            boss_email=email_jefe,
                            alert_date=emp.get("alert_date_raw") or date.today(),
                            alert_type=tipo_alerta,
                            alert_reason=emp.get("alert_reason", ""),
                        )
                        if token:
                            token_map[rut] = token

                empleados_jefe_ordenados = sorted(
                    empleados_jefe,
                    key=lambda e: _parse_date_safe(e["fecha_alerta"]),
                    reverse=False,
                )

                html = _generate_email_html(nombre_jefe, empleados_jefe_ordenados, incidencias, token_map)

                lista_copia = [c.strip() for c in settings.EMAIL_CC_LIST.split(",") if c.strip()]
                copia_final = [c for c in lista_copia if c not in (email_jefe, email_jefe_jefe)]
                cc_parts = ([email_jefe_jefe] if email_jefe_jefe else []) + copia_final
                cc_str = "; ".join(cc_parts)

                subject = f"Alertas de contratos - {len(empleados_jefe)} empleado(s) requieren atención"

                email_enviado = _send_email_graph(email_jefe, cc_str, subject, html)

                if email_enviado:
                    for rut, tipo_alerta in ruts_procesados:
                        self.repository.mark_as_processed(rut, tipo_alerta)
                    jefes_exitosos += 1
                    alertas_enviadas += len(empleados_jefe)
                    detalle_enviados.append({
                        "boss_name": nombre_jefe,
                        "boss_email": email_jefe,
                        "empleados": [
                            {
                                "nombre": e["empleado"],
                                "cargo": e["cargo"],
                                "fecha_alerta": e["fecha_alerta"],
                                "tipo_alerta": e["tipo_alerta"],
                            }
                            for e in empleados_jefe_ordenados
                        ],
                    })
                    logger.info(f"Correo enviado a {nombre_jefe} con {len(empleados_jefe)} alerta(s)")
                else:
                    jefes_con_error += 1
                    alertas_con_error += len(empleados_jefe)
                    detalle_errores.append({"boss_name": nombre_jefe, "boss_email": email_jefe})

        except AuthRequiredError:
            return {
                "auth_required": True,
                "message": "Se requiere autorización de Microsoft. Usa el botón 'Autorizar correo' y vuelve a intentarlo.",
            }

        return {
            "bosses_successful": jefes_exitosos,
            "bosses_failed": jefes_con_error,
            "alerts_sent": alertas_enviadas,
            "alerts_failed": alertas_con_error,
            "message": f"Envío completado: {jefes_exitosos} jefe(s) notificados, {jefes_con_error} error(es).",
            "detalle_enviados": detalle_enviados,
            "detalle_errores": detalle_errores,
        }

    # ================================================================
    # Calendario de Cierres
    # ================================================================

    def get_calendario(self, anio: int) -> Dict[str, Any]:
        """Obtiene los cierres de un año"""
        cierres = self.repository.get_cierres_by_year(anio)
        return {"anio": anio, "cierres": cierres}

    def save_cierre(self, anio: int, mes: int, fecha_cierre) -> bool:
        """Crea o actualiza un cierre"""
        return self.repository.upsert_cierre(anio, mes, fecha_cierre)

    def delete_cierre(self, cierre_id: int) -> bool:
        """Elimina un cierre"""
        return self.repository.delete_cierre(cierre_id)

    # ================================================================
    # Seguimiento de respuestas
    # ================================================================

    def get_tracking(self) -> List[Dict[str, Any]]:
        return self.tracking.get_all_tracking()

    def _decode_token(self, token: str) -> Optional[dict]:
        """Decodifica JWT. Retorna None si inválido, {} si es UUID legacy (sin payload)."""
        from app.core.security import decode_response_token
        import re
        uuid_pattern = re.compile(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE
        )
        if uuid_pattern.match(token):
            logger.info(f"[token] UUID legacy detectado, omitiendo validación JWT")
            return {}  # token legacy válido pero sin payload JWT
        return decode_response_token(token)  # None si JWT inválido

    def preview_respond(
        self, token: str, answer: str,
        ip: Optional[str] = None, user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Retorna datos del registro para mostrar página de confirmación. No guarda."""
        valid_answers = {"indefinido", "plazo_fijo", "no_renovar"}
        if answer not in valid_answers:
            return {"ok": False, "error": "Respuesta inválida"}
        jwt_payload = self._decode_token(token)
        if jwt_payload is None:
            return {"ok": False, "error": "Link inválido o corrupto"}
        record = self.tracking.get_by_token(token)
        if not record:
            return {"ok": False, "error": "Token no válido"}
        self.tracking.log_event(
            tracking_id=record["id"],
            event_type="link_opened",
            answer=answer,
            ip=ip,
            user_agent=user_agent,
        )
        return {
            "ok": True,
            "record": record,
            "answer": answer,
            "already_answered": bool(record.get("response")),
            "token_boss_email": jwt_payload.get("boss_email", ""),
        }

    def respond(
        self, token: str, answer: str,
        responder_ip: str = None, user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Registra respuesta confirmada. Verifica JWT, guarda respuesta, envía email de confirmación."""
        valid_answers = {"indefinido", "plazo_fijo", "no_renovar"}
        if answer not in valid_answers:
            return {"ok": False, "error": "Respuesta inválida"}
        jwt_payload = self._decode_token(token)
        if jwt_payload is None:
            return {"ok": False, "error": "Link inválido o corrupto"}
        record = self.tracking.get_by_token(token)
        if not record:
            return {"ok": False, "error": "Token no válido"}
        if record.get("response"):
            return {"ok": True, "already_answered": True, "record": record}
        # Auditar mismatch boss_email solo en tokens JWT (no legacy)
        token_boss_email = jwt_payload.get("boss_email", "")
        if token_boss_email and token_boss_email != record.get("boss_email", ""):
            logger.warning(
                f"[respond] Mismatch boss_email: token={token_boss_email} "
                f"db={record.get('boss_email')} employee={record.get('employee_name')} ip={responder_ip}"
            )
        self.tracking.log_event(
            tracking_id=record["id"],
            event_type="confirm_submitted",
            answer=answer,
            ip=responder_ip,
            user_agent=user_agent,
        )
        ok = self.tracking.set_response(token, answer, responder_ip=responder_ip)
        if ok:
            self._send_confirmation_email(record, answer)
            return {"ok": True, "already_answered": False, "record": record, "answer": answer}
        return {"ok": False, "error": "Error al guardar respuesta"}

    def _send_confirmation_email(self, record: Dict[str, Any], answer: str) -> None:
        """Envía email al jefe confirmando la decisión registrada."""
        from app.core.config import settings
        boss_email = record.get("boss_email", "")
        boss_name = record.get("boss_name", "")
        employee_name = record.get("employee_name", "")
        alert_date = record.get("alert_date", "")
        answer_label = {
            "indefinido": "Renovar - Contrato Indefinido",
            "plazo_fijo": "Renovar - Plazo Fijo",
            "no_renovar": "No Renovar",
        }.get(answer, answer)
        color = "#dc2626" if answer == "no_renovar" else "#16a34a"
        html = f"""
        <html><head><meta charset="utf-8"></head>
        <body style="font-family:sans-serif;padding:20px;background:#f8f9fa">
          <div style="max-width:480px;margin:0 auto;background:white;padding:32px;border-radius:10px;
                      box-shadow:0 2px 8px rgba(0,0,0,.08)">
            <h2 style="color:#1e293b;margin-top:0">Confirmación de decisión registrada</h2>
            <p style="color:#475569">Hola <strong>{boss_name}</strong>,</p>
            <p style="color:#475569">Se ha registrado la siguiente decisión en el sistema de alertas de contratos:</p>
            <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:4px 0;color:#334155"><strong>Empleado:</strong> {employee_name}</p>
              <p style="margin:4px 0;color:#334155"><strong>Vencimiento:</strong> {alert_date}</p>
              <p style="margin:4px 0;color:{color};font-weight:bold"><strong>Decisión:</strong> {answer_label}</p>
            </div>
            <p style="color:#ef4444;font-size:14px">
              Si <strong>no fuiste tú</strong> quien realizó esta acción, contacta inmediatamente al área de Recursos Humanos.
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
            <p style="color:#94a3b8;font-size:12px">Este es un correo automático del Sistema de Alertas de Contratos. No responder.</p>
          </div>
        </body></html>
        """
        try:
            _send_email_graph(
                to=boss_email,
                cc="",
                subject=f"[Confirmación] Decisión registrada: {answer_label} — {employee_name}",
                html_body=html,
            )
            logger.info(f"[confirm-email] Enviado a {boss_email} para {employee_name}")
        except Exception as e:
            logger.error(f"[confirm-email] Error enviando a {boss_email}: {e}")

    def sync_to_buk(self, tracking_id: int) -> Dict[str, Any]:
        """
        Sincroniza respuesta a BUK vía PATCH.
        Fetcha job_id y contract_finishing_date_2 desde BUK antes del PATCH.
        """
        import httpx
        from app.core.config import settings

        # Obtener registro de tracking por id
        from sqlalchemy import text
        row = self.tracking.db.execute(
            text("""
                SELECT id, employee_id, alert_date, alert_type, response, buk_synced
                FROM app.contract_alert_tracking
                WHERE id = :id
            """),
            {"id": tracking_id}
        ).fetchone()

        if not row:
            return {"ok": False, "error": "Registro no encontrado"}

        rec = dict(zip(["id", "employee_id", "alert_date", "alert_type", "response", "buk_synced"], row))

        if not rec["response"] or rec["response"] == "no_renovar":
            return {"ok": False, "error": "Solo se sincronizan respuestas de renovación"}

        if rec["buk_synced"]:
            return {"ok": False, "error": "Ya sincronizado con BUK"}

        employee_id = rec["employee_id"]
        alert_date: date = rec["alert_date"]
        response = rec["response"]

        # Fetch employee data from BUK para obtener job_id y contract_finishing_date_2
        try:
            buk_resp = httpx.get(
                f"{settings.BUK_API_BASE_URL}/employees/{employee_id}",
                headers={"auth_token": settings.BUK_API_KEY},
                timeout=15,
            )
            buk_resp.raise_for_status()
            buk_data = buk_resp.json().get("data", {})
        except Exception as e:
            err = f"Error fetching BUK employee {employee_id}: {e}"
            logger.error(err)
            self.tracking.mark_buk_synced(tracking_id, error=err)
            return {"ok": False, "error": err}

        current_job = buk_data.get("current_job", {})
        job_id = current_job.get("id")
        if not job_id:
            err = f"No se encontró current_job.id para employee_id={employee_id}"
            self.tracking.mark_buk_synced(tracking_id, error=err)
            return {"ok": False, "error": err}

        # Construir body del PATCH
        start_date = date(alert_date.year, alert_date.month, 1).strftime("%Y-%m-%d")

        if response == "indefinido":
            contract_type = "Indefinido"
            end_of_contract = ""
        else:  # plazo_fijo
            contract_type = "Plazo fijo"
            end_of_contract = current_job.get("contract_finishing_date_2") or ""

        patch_body = {
            "start_date": start_date,
            "type_of_contract": contract_type,
            "end_of_contract": end_of_contract,
            "end_of_contract_2": "",
        }

        try:
            patch_resp = httpx.patch(
                f"{settings.BUK_API_BASE_URL}/employees/{employee_id}/jobs/{job_id}",
                headers={"auth_token": settings.BUK_RENOVACIONES_KEY, "Content-Type": "application/json"},
                json=patch_body,
                timeout=15,
            )
            patch_resp.raise_for_status()
            self.tracking.mark_buk_synced(tracking_id)
            logger.info(f"BUK sync OK: employee_id={employee_id} job_id={job_id} type={contract_type}")
            return {"ok": True, "employee_id": employee_id, "job_id": job_id, "contract_type": contract_type}
        except Exception as e:
            err = f"Error PATCH BUK employee={employee_id} job={job_id}: {e}"
            logger.error(err)
            self.tracking.mark_buk_synced(tracking_id, error=err)
            return {"ok": False, "error": err}

    def send_followup_emails(self, boss_email_filter: Optional[str] = None) -> Dict[str, Any]:
        """
        Envía recordatorios a jefaturas que no han respondido.
        boss_email_filter: si se indica, envía solo a ese jefe.
        """
        from app.services.email_token_service import AuthRequiredError

        pendientes = self.tracking.get_pending_followups()
        if boss_email_filter:
            pendientes = [r for r in pendientes if r["boss_email"] == boss_email_filter]
        if not pendientes:
            logger.info("[Followup] Sin seguimientos pendientes")
            return {"sent": 0, "errors": 0}

        # Agrupar por jefe
        por_jefe: Dict[str, List[Dict]] = {}
        for rec in pendientes:
            key = rec["boss_email"]
            if key not in por_jefe:
                por_jefe[key] = []
            por_jefe[key].append(rec)

        enviados = 0
        errores = 0

        try:
            for boss_email, registros in por_jefe.items():
                boss_name = registros[0]["boss_name"]
                token_map = {r["rut"]: r["response_token"] for r in registros}

                empleados_data = [
                    {
                        "empleado": r["employee_name"],
                        "rut": r["rut"],
                        "cargo": r["employee_role"] or "N/A",
                        "email": "",
                        "fecha_alerta": r["alert_date_fmt"],
                        "motivo": r["alert_reason"] or "Vencimiento de contrato",
                        "tipo_alerta": r["alert_type"],
                    }
                    for r in registros
                ]

                html = _generate_email_html(boss_name, empleados_data, [], token_map, is_followup=True)
                subject = f"[Recordatorio] Alertas de contratos - {len(registros)} empleado(s) pendiente(s)"

                ok = _send_email_graph(boss_email, "", subject, html)
                if ok:
                    enviados += 1
                    logger.info(f"[Followup] Recordatorio enviado a {boss_email} ({len(registros)} empleados)")
                else:
                    errores += 1
        except AuthRequiredError:
            logger.error("[Followup] Token Microsoft expirado, no se enviaron recordatorios")
            return {"sent": 0, "errors": len(por_jefe), "auth_required": True}

        return {"sent": enviados, "errors": errores}


# ============================================================================
# Funciones auxiliares (fuera de la clase)
# ============================================================================

def _parse_date_safe(date_str: str) -> datetime:
    """Parsea una fecha dd-MM-yyyy de forma segura"""
    try:
        return datetime.strptime(date_str, "%d-%m-%Y")
    except (ValueError, TypeError):
        return datetime.max


def _send_email_graph(to: str, cc: str, subject: str, html_body: str) -> bool:
    """Envía un email vía Microsoft Graph API usando el refresh token almacenado.
    Lanza AuthRequiredError si no hay sesión activa."""
    import httpx
    from app.services.email_token_service import get_access_token, AuthRequiredError  # noqa: F401

    access_token = get_access_token()  # puede lanzar AuthRequiredError

    cc_recipients = [
        {"emailAddress": {"address": addr.strip()}}
        for addr in cc.split(";")
        if addr.strip()
    ]

    try:
        resp = httpx.post(
            "https://graph.microsoft.com/v1.0/me/sendMail",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "message": {
                    "subject": subject,
                    "body": {"contentType": "HTML", "content": html_body},
                    "toRecipients": [{"emailAddress": {"address": to}}],
                    "ccRecipients": cc_recipients,
                }
            },
            timeout=20,
        )
        resp.raise_for_status()
        logger.info(f"Email enviado exitosamente a {to}")
        return True
    except Exception as e:
        logger.error(f"Error enviando email a {to}: {e}")
        return False


def _generate_incidencias_html(rut: str, incidencias: List[Dict[str, Any]]) -> str:
    """Genera HTML de tabla de incidencias para un RUT específico"""
    inc_empleado = [i for i in incidencias if i.get("rut_empleado") == rut]

    if not inc_empleado:
        return "<p style='margin-left: 20px; color: #6c757d; font-style: italic; font-size: 13px; border-top: 1px solid #ccc; border-bottom: 1px solid #ccc; padding-top: 5px; padding-bottom: 5px;'>Este colaborador/a no registra ausencias, permisos o licencias activas.</p>"

    html = """
    <div style='margin-left: 20px; margin-top: 10px; margin-bottom: 20px;'>
        <h4 style='color: #2c3e50; border-left: 4px solid #f39c12; padding-left: 10px; font-size: 14px; margin-bottom: 10px;'>
            Permisos y Licencias Encontradas:
        </h4>
        <table style='width: 95%; border-collapse: collapse; margin-top: 5px; font-size: 12px; border: 1px solid #e0e0e0;'>
            <thead>
                <tr style='background-color: #34495e;'>
                    <th style='padding: 8px 12px; border: 1px solid #ccc; color: #333; text-align: left;'>Tipo de Permiso</th>
                    <th style='padding: 8px 12px; border: 1px solid #ccc; color: #333; text-align: left;'>Fecha Inicio</th>
                    <th style='padding: 8px 12px; border: 1px solid #ccc; color: #333; text-align: left;'>Fecha Fin</th>
                </tr>
            </thead>
            <tbody>
    """

    for i, row in enumerate(inc_empleado):
        row_style = "background-color: #f9f9f9;" if i % 2 == 0 else "background-color: white;"
        html += f"""
                <tr style='{row_style}'>
                    <td style='padding: 8px 12px; border: 1px solid #e0e0e0;'>{row.get('tipo_permiso', '')}</td>
                    <td style='padding: 8px 12px; border: 1px solid #e0e0e0;'>{row.get('fecha_inicio_formato', '')}</td>
                    <td style='padding: 8px 12px; border: 1px solid #e0e0e0;'>{row.get('fecha_fin_formato', '')}</td>
                </tr>
        """

    html += """
            </tbody>
        </table>
    </div>
    """
    return html


def _generate_email_html(
    nombre_jefe: str,
    empleados_data: List[Dict],
    incidencias: List[Dict[str, Any]],
    token_map: Dict[str, str] = None,
    is_followup: bool = False,
) -> str:
    """
    Genera el HTML completo del email de alertas para un jefe.
    Portado desde template_mails.py -> ReporteManager._generar_html_reporte_por_jefe
    """
    from app.core.config import settings
    public_url = getattr(settings, "PUBLIC_URL", "").rstrip("/")

    # Agrupar empleados por motivo
    empleados_por_motivo = {}
    for emp in empleados_data:
        motivo = emp["motivo"]
        if motivo not in empleados_por_motivo:
            empleados_por_motivo[motivo] = []
        empleados_por_motivo[motivo].append(emp)

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Alertas de Contratos</title>
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0;
                padding: 20px;
                background-color: #f8f9fa;
            }}
            .container {{
                max-width: 800px;
                margin: 0 auto;
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }}
            .group-title {{
                background: #2e43ff;
                width: fit-content;
                color: white; 
                font-weight: bold;
                font-size: 1.1em;
                border: 2px solid #adb5bd;
                margin-top: 30px;
                padding: 15px 0;
                text-align: center;
            }}
            .alerta-tabla {{
                width: fit-content;
                border-collapse: collapse;
                margin-top: 5px; 
                margin-bottom: 10px; 
                border: 1px solid #ccc;
            }}
            .alerta-tabla th, .alerta-tabla td {{
                padding: 6px 25px;
                text-align: left;
                border: 1px solid #ddd;
            }}
            .alerta-tabla th {{
                background-color: transparent;
                color: #333;
                font-weight: bold;
            }}
            .alerta-tabla tr:nth-child(odd) {{
                background-color: #ffffff;
            }}
            .alerta-tabla tr:nth-child(even) {{
                background-color: #f8f9fa;
            }}
            .urgente {{
                background-color: #f7f7f7 !important;
            }}
            .incidencia-row td {{
                padding: 0;
                border: none;
                background-color: #f8f9fa; 
            }}
            .header {{ text-align: center; border-bottom: 3px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }}
            .header h1 {{ color: #2e43ff; margin: 0; font-size: 28px; }}
            .jefe-info {{ background: #f7f8f8; padding: 15px; border-radius: 6px; margin-bottom: 25px; }}
            .jefe-info h2 {{ margin: 0; color: #2e43ff; }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 2px solid #dee2e6; text-align: center; color: #6c757d; font-size: 14px; }}
        </style>
    </head>
    <body>
            <div class="jefe-info">
                <p>{'<strong>⚠️ RECORDATORIO</strong> — ' if is_followup else ''}Buenos días {nombre_jefe}:</p>
                <p>Junto con saludar, {'le recordamos que aún tiene ' if is_followup else ''}notificamos los siguientes vencimientos de contrato{'<strong> pendientes de respuesta</strong>' if is_followup else ''}:</p>
                <p>(*) Haga clic en el botón correspondiente para indicar su decisión de renovación.</p>
                <p>Por favor contestar a la brevedad, por motivos de cierre de mes.</p>
            </div>
    """

    for motivo in sorted(empleados_por_motivo.keys()):
        grupo_empleados = empleados_por_motivo[motivo]

        html += f"""
            <h3 class="group-title">{motivo}</h3>
            <table class="alerta-tabla">
                <thead>
                    <tr>
                        <th style="width: 35%;">Empleado</th>
                        <th style="width: 25%;">Cargo</th>
                        <th style="width: 15%;">Fecha Vencimiento</th>
                        <th style="width: 25%;">Renovar (*)</th>
                    </tr>
                </thead>
                <tbody>
        """

        for emp in grupo_empleados:
            rut_empleado = emp.get("rut", "")
            clase_fila = "urgente" if emp["tipo_alerta"] == "INDEFINIDO" else ""
            token = (token_map or {}).get(rut_empleado, "")

            if token and public_url:
                base = f"{public_url}/api/v1/contract-alerts/respond?token={token}&answer="
                renovar_answer = "indefinido" if emp["tipo_alerta"] == "INDEFINIDO" else "plazo_fijo"
                renovar_cell = f"""
                    <td style="width: 25%; padding: 4px 8px;">
                        <a href="{base}{renovar_answer}" style="display:inline-block;margin:2px;padding:4px 8px;background:#16a34a;color:white;text-decoration:none;border-radius:4px;font-size:11px;font-weight:bold;">✓ Renovar</a>
                        <a href="{base}no_renovar" style="display:inline-block;margin:2px;padding:4px 8px;background:#dc2626;color:white;text-decoration:none;border-radius:4px;font-size:11px;font-weight:bold;">✗ No Renovar</a>
                    </td>
                """
            else:
                renovar_cell = '<td style="width: 25%; background-color: #FFDDC1;"></td>'

            html += f"""
                <tr class="{clase_fila}">
                    <td style="width: 35%;"><strong>{emp['empleado']}</strong></td>
                    <td style="width: 25%;">{emp['cargo']}</td>
                    <td style="width: 15%;">{emp['fecha_alerta']}</td>
                    {renovar_cell}
                </tr>
            """

            # Subtabla de incidencias
            tabla_incidencias_html = _generate_incidencias_html(rut_empleado, incidencias)
            html += f"""
                <tr class="incidencia-row">
                    <td colspan="4" style="padding: 0; border: none;"> 
                        {tabla_incidencias_html}
                    </td>
                </tr>
            """

        html += """
                </tbody>
            </table>
        """

    html += """
            <div class="footer">
                <p>Correo generado por el Sistema de Alertas de Contratos</p>
                <hr>
                <small>Para consultas, contacte al área de Recursos Humanos o responda este correo.</small>
            </div>
        </div>
    </body>
    </html>
    """
    return html
