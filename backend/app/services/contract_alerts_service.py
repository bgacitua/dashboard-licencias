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

# ponytail: interruptor del PATCH real a BUK. False = "Sync BUK" solo marca el
# registro en la DB (sincronización manual fuera del sistema).
BUK_SYNC_ENABLED = False

# Vigencia del link de respuesta, contada desde el último envío. Corta la
# ventana en que un token filtrado (correo reenviado, logs) sigue sirviendo.
# Si vence, el recordatorio emite uno nuevo.
TOKEN_TTL_HORAS = 72

VALID_ANSWERS = {"indefinido", "plazo_fijo", "no_renovar"}

ANSWER_LABELS = {
    "indefinido": "Renovar - Contrato Indefinido",
    "plazo_fijo": "Renovar - Plazo Fijo",
    "no_renovar": "No Renovar",
}


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

    def send_alerts_by_boss(
        self, bosses_filter: List[Dict[str, str]], days_override: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Envía alertas agrupadas por jefe vía Outlook COM.
        bosses_filter: [{"boss_name": "...", "boss_email": "..."}]
        days_override: mismo rango que el listado. Sin él se recalcula el rango
        dinámico, que puede ser más corto y dejar fuera lo que el usuario ve.
        """
        fecha_fin = self._get_end_date(days_override)
        logger.info(f"[Envío] Buscando alertas hasta {fecha_fin} (override={days_override})")
        alerts = self.repository.get_pending_alerts(end_date=fecha_fin)
        incidencias = self.repository.get_all_incidencias()

        if not alerts:
            logger.warning(f"[Envío] Sin alertas pendientes hasta {fecha_fin}: no se envía nada.")
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
            logger.warning(
                f"[Envío] Las {len(alerts)} alertas del rango ya están marcadas como "
                f"procesadas (o sin alert_type): no se envía nada."
            )
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
            logger.warning(
                f"[Envío] Ninguna alerta pendiente coincide con los {len(bosses_filter)} "
                f"jefe(s) seleccionado(s): {[d.get('boss_email') for d in bosses_filter]}. "
                f"Rango usado: hasta {fecha_fin}."
            )
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

    def _lookup_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Resuelve el token opaco contra la BD. None si no existe o caducó.

        No hay nada que validar criptográficamente: el token no lleva datos. La
        única fuente de verdad es la fila. Caduca a las TOKEN_TTL_HORAS de cuando
        se emitió el token —no del último envío principal—, así el recordatorio
        reabre la ventana sin alterar su propia cadencia diaria.

        El fallback cubre las filas anteriores a la migración 032, que no tienen
        token_issued_at poblado.
        """
        record = self.tracking.get_by_token(token)
        if not record:
            return None
        emitido = (record.get("token_issued_at")
                   or record.get("last_followup_at")
                   or record.get("first_sent_at"))
        if emitido and datetime.now(emitido.tzinfo) - emitido > timedelta(hours=TOKEN_TTL_HORAS):
            logger.info(f"[token] caducado para tracking_id={record.get('id')}")
            return None
        return record

    def preview_respond(
        self, token: str, answer: Optional[str] = None,
        ip: Optional[str] = None, user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Retorna datos del registro para mostrar página de confirmación. No guarda.

        `answer` ya no viene en el link del correo: la elige la persona en la
        página. Se sigue aceptando para no romper links viejos en tránsito.
        """
        if answer is not None and answer not in VALID_ANSWERS:
            return {"ok": False, "error": "Respuesta inválida"}
        record = self._lookup_token(token)
        if not record:
            return {"ok": False, "error": "Link inválido o vencido"}
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
            "token_boss_email": record.get("boss_email", ""),
        }

    def respond(
        self, token: str, answer: str,
        responder_ip: str = None, user_agent: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Registra respuesta confirmada. Valida token contra BD y envía email de confirmación."""
        if answer not in VALID_ANSWERS:
            return {"ok": False, "error": "Respuesta inválida"}
        record = self._lookup_token(token)
        if not record:
            return {"ok": False, "error": "Link inválido o vencido"}
        if record.get("response"):
            return {"ok": True, "already_answered": True, "record": record}
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
        # No actualizó: o hubo error, o otro request respondió entremedio. En
        # ambos casos la fila manda; releerla evita pisar una decisión ajena.
        actual = self.tracking.get_by_token(token)
        if actual and actual.get("response"):
            return {"ok": True, "already_answered": True, "record": actual}
        return {"ok": False, "error": "Error al guardar respuesta"}

    def _send_confirmation_email(self, record: Dict[str, Any], answer: str) -> None:
        """Envía email al jefe confirmando la decisión registrada."""
        from app.core.config import settings
        boss_email = record.get("boss_email", "")
        boss_name = record.get("boss_name", "")
        employee_name = record.get("employee_name", "")
        alert_date = record.get("alert_date", "")
        answer_label = ANSWER_LABELS.get(answer, answer)
        color = T.C.DANGER if answer == "no_renovar" else T.C.OK
        body = f"""
            <p style="{T.P}">Hola <strong>{boss_name}</strong>,</p>
            <p style="{T.P}">Se ha registrado la siguiente decisión en el sistema de alertas
               de contratos:</p>
            {T.panel(
                f'<p style="{T.P};margin:6px 0"><strong>Empleado:</strong> {employee_name}</p>'
                f'<p style="{T.P};margin:6px 0"><strong>Vencimiento:</strong> {alert_date}</p>'
                f'<p style="{T.P};margin:6px 0;color:{color};font-weight:bold">'
                f'<strong>Decisión:</strong> {answer_label}</p>'
            )}
            {T.callout('Si <strong>no fuiste tú</strong> quien realizó esta acción, contacta '
                       'inmediatamente al área de Recursos Humanos.', 'warn')}"""
        html = T.email_shell("Confirmación de decisión registrada", body)
        try:
            _send_email_graph(
                to=boss_email,
                cc="grupodeseleccion@cramer.cl; rrhh@cramer.cl",
                bcc="",
                subject=f"[Confirmación] Decisión registrada: {answer_label} — {employee_name}",
                html_body=html,
            )
            logger.info(f"[confirm-email] Enviado a {boss_email} para {employee_name}")
        except Exception as e:
            logger.error(f"[confirm-email] Error enviando a {boss_email}: {e}")

    def _notify_sync(self, rec: Dict[str, Any], ok: bool, detail: str, trigger: str) -> None:
        """Notifica el resultado de la renovación a Telegram vía n8n. No propaga errores."""
        from app.services.scheduler_service import _notify_n8n

        tipo = "Indefinido" if rec["response"] == "indefinido" else "Plazo Fijo"
        estado = "✅ Renovación aplicada en BUK" if ok else "❌ Falló la renovación en BUK"
        _notify_n8n({
            "tipo": "buk_sync",
            "ok": ok,
            "trigger": trigger,  # 'auto' | 'manual'
            "tracking_id": rec["id"],
            "employee_id": rec["employee_id"],
            "mensaje": (
                f"{estado}\n"
                f"Empleado: {rec.get('employee_name') or rec['employee_id']}\n"
                f"Jefatura: {rec.get('boss_name') or '—'}\n"
                f"Tipo: {tipo}\n"
                f"Vencimiento: {rec['alert_date']}\n"
                f"Detalle: {detail}"
            ),
        })

    def sync_to_buk(self, tracking_id: int, trigger: str = "manual") -> Dict[str, Any]:
        """
        Sincroniza la respuesta a BUK ejecutando el flujo de renovación en la web.
        trigger: 'manual' (botón Sync BUK) o 'auto' (al responder la jefatura).
        """
        import httpx
        from app.core.config import settings

        # Obtener registro de tracking por id
        from sqlalchemy import text
        row = self.tracking.db.execute(
            text("""
                SELECT id, employee_id, alert_date, alert_type, response, buk_synced,
                       employee_name, boss_name
                FROM app.contract_alert_tracking
                WHERE id = :id
            """),
            {"id": tracking_id}
        ).fetchone()

        if not row:
            logger.warning(f"[sync_to_buk] tracking_id={tracking_id} no existe")
            return {"ok": False, "error": "Registro no encontrado"}

        rec = dict(zip(
            ["id", "employee_id", "alert_date", "alert_type", "response", "buk_synced",
             "employee_name", "boss_name"],
            row,
        ))

        if not rec["response"] or rec["response"] == "no_renovar":
            logger.info(f"[sync_to_buk] tracking_id={tracking_id} response={rec['response']!r}, no aplica")
            return {"ok": False, "error": "Solo se sincronizan respuestas de renovación"}

        if rec["buk_synced"]:
            logger.info(f"[sync_to_buk] tracking_id={tracking_id} ya sincronizado")
            return {"ok": False, "error": "Ya sincronizado con BUK"}

        employee_id = rec["employee_id"]
        alert_date: date = rec["alert_date"]
        response = rec["response"]
        contract_type = "Indefinido" if response == "indefinido" else "Plazo fijo"

        # PATCH a BUK deshabilitado: la renovación se hace por la UI de BUK
        # (Playwright), que aplica las reglas de negocio del flujo real.
        if not BUK_SYNC_ENABLED:
            from app.services.buk_scraper import renovar_contrato
            try:
                res = renovar_contrato(employee_id, response)
            except Exception as e:
                err = f"Error renovando en BUK web employee={employee_id}: {e}"
                logger.error(err)
                self.tracking.mark_buk_synced(tracking_id, error=err)
                self._notify_sync(rec, ok=False, detail=str(e), trigger=trigger)
                return {"ok": False, "error": err}
            self.tracking.mark_buk_synced(tracking_id)
            self._notify_sync(rec, ok=True, detail=f"job {res['job_id']}", trigger=trigger)
            return {
                "ok": True,
                "employee_id": employee_id,
                "job_id": res["job_id"],
                "contract_type": res["contract_type"],
                "via": "web",
            }

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

                # La primera vez que una fila cae acá su token ya cumplió las
                # TOKEN_TTL_HORAS: la consulta de pendientes pide 3 días sin alerta,
                # que son las mismas 72 horas de la ventana. Reusarlo manda un link
                # muerto, así que el recordatorio emite uno nuevo por empleado y
                # mark_followup_sent() le abre la ventana al salir el correo.
                token_map: Dict[str, str] = {}
                rotados: List[int] = []
                for r in registros:
                    nuevo_token = self.tracking.rotate_token(r["id"])
                    if not nuevo_token:
                        logger.error(
                            f"[Followup] No se pudo rotar el token de tracking_id={r['id']}, "
                            f"va sin link"
                        )
                        continue
                    token_map[r["rut"]] = nuevo_token
                    rotados.append(r["id"])

                if not token_map:
                    logger.error(f"[Followup] Sin tokens utilizables para {boss_email}, no se envía")
                    errores += 1
                    continue

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
                    # Recién ahora corre la ventana de los tokens que acaban de salir.
                    for tracking_id in rotados:
                        self.tracking.mark_followup_sent(tracking_id)
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


# Implementación movida a app/services/email_service.py para compartirla con horas extras.
# Se mantiene el nombre local para no tocar las llamadas existentes.
from app.services.email_service import send_email_graph as _send_email_graph  # noqa: E402
from app.services import email_templates as T  # noqa: E402


def _generate_incidencias_html(rut: str, incidencias: List[Dict[str, Any]]) -> str:
    """Genera HTML de tabla de incidencias para un RUT específico"""
    inc_empleado = [i for i in incidencias if i.get("rut_empleado") == rut]

    if not inc_empleado:
        return (f'<p style="{T.MUTED};margin:6px 0 14px 20px;font-style:italic;'
                f'font-size:13px">Este colaborador/a no registra ausencias, permisos o '
                f"licencias activas.</p>")

    filas = "".join(
        f"""<tr>
                <td style="{T.TD};font-size:13px">{row.get('tipo_permiso', '')}</td>
                <td style="{T.TD};font-size:13px">{row.get('fecha_inicio_formato', '')}</td>
                <td style="{T.TD};font-size:13px">{row.get('fecha_fin_formato', '')}</td>
            </tr>"""
        for row in inc_empleado
    )

    return f"""
    <div style="margin:8px 0 18px 20px">
        <p style="{T.P};margin:0 0 6px;font-size:13px;font-weight:600;
                  border-left:3px solid {T.C.PRIMARY};padding-left:9px">
            Permisos y licencias encontradas:
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
               style="{T.TABLE};width:95%;margin:0">
            <thead><tr>
                <th style="{T.TH}">Tipo de Permiso</th>
                <th style="{T.TH}">Fecha Inicio</th>
                <th style="{T.TH}">Fecha Fin</th>
            </tr></thead>
            <tbody>{filas}</tbody>
        </table>
    </div>"""


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
    from pytz import timezone
    public_url = getattr(settings, "PUBLIC_URL", "").rstrip("/")

    # Saludo según hora local de Santiago de Chile (>= 12:00 -> tardes)
    hora_santiago = datetime.now(timezone("America/Santiago")).hour
    saludo = "Buenas tardes" if hora_santiago >= 12 else "Buenos días"

    # Agrupar empleados por motivo
    empleados_por_motivo = {}
    for emp in empleados_data:
        motivo = emp["motivo"]
        if motivo not in empleados_por_motivo:
            empleados_por_motivo[motivo] = []
        empleados_por_motivo[motivo].append(emp)

    intro = "".join([
        f'<p style="{T.P}">{"<strong>⚠️ RECORDATORIO</strong> — " if is_followup else ""}'
        f'{saludo} {nombre_jefe}:</p>',
        f'<p style="{T.P}">Junto con saludar, '
        f'{"le recordamos que aún tiene " if is_followup else ""}notificamos los siguientes '
        f'vencimientos de contrato'
        f'{"<strong> pendientes de respuesta</strong>" if is_followup else ""}:</p>',
        f'<p style="{T.P}">(*) Haga clic en el botón correspondiente para indicar su '
        f'decisión de renovación.</p>',
        T.callout("Por favor contestar a la brevedad, por motivos de cierre de mes.", "warn"),
    ])

    body = intro

    for motivo in sorted(empleados_por_motivo.keys()):
        grupo_empleados = empleados_por_motivo[motivo]

        body += f"""
            <p style="{T.H2};margin:26px 0 0">{motivo}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"
                   style="{T.TABLE}">
                <thead>
                    <tr>
                        <th style="{T.TH};width:35%">Empleado</th>
                        <th style="{T.TH};width:22%">Cargo</th>
                        <th style="{T.TH};width:16%">Fecha Vencimiento</th>
                        <th style="{T.TH};width:27%">Renovar (*)</th>
                    </tr>
                </thead>
                <tbody>
        """

        for emp in grupo_empleados:
            rut_empleado = emp.get("rut", "")
            # INDEFINIDO se destaca: es el caso que no admite otra salida que renovar.
            fila_bg = f";background:{T.C.SURFACE}" if emp["tipo_alerta"] == "INDEFINIDO" else ""
            token = (token_map or {}).get(rut_empleado, "")

            if token and public_url:
                # Un solo link, sin la decisión dentro: abrirlo no registra nada.
                # La elección se hace en la página y se manda por POST, para que
                # ningún escáner de correo ni prefetch pueda responder por el jefe.
                link = f"{public_url}/api/v1/contract-alerts/respond?token={token}"
                renovar_cell = f"""
                    <td style="{T.TD}{fila_bg}">
                        {T.button(link, 'Responder', T.C.PRIMARY, small=True)}
                    </td>
                """
            else:
                renovar_cell = f'<td style="{T.TD};background:{T.C.DANGER_BG}"></td>'

            body += f"""
                <tr>
                    <td style="{T.TD}{fila_bg};font-weight:600">{emp['empleado']}</td>
                    <td style="{T.TD}{fila_bg}">{emp['cargo']}</td>
                    <td style="{T.TD}{fila_bg}">{emp['fecha_alerta']}</td>
                    {renovar_cell}
                </tr>
            """

            # Subtabla de incidencias
            body += f"""
                <tr>
                    <td colspan="4" style="padding:0;border:1px solid {T.C.BORDER};
                                           border-top:none;background:{T.C.WHITE}">
                        {_generate_incidencias_html(rut_empleado, incidencias)}
                    </td>
                </tr>
            """

        body += """
                </tbody>
            </table>
        """

    return T.email_shell("Alertas de contratos", body)
