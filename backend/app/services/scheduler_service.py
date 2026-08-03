"""
Scheduler de envío automático de alertas de contratos.
Corre diariamente, pero solo ejecuta el envío si:
  - Es lunes (ejecución semanal normal), o
  - Modo cierre activo (≤7 días al cierre de mes) → ejecuta todos los días de esa semana.
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from pytz import timezone

from app.core.config import settings
from app.core.logging_config import logger

_scheduler: BackgroundScheduler | None = None


def _notify_n8n(payload: dict) -> None:
    """Envía notificación al webhook de n8n. Falla silenciosamente."""
    if not settings.ALERTS_N8N_WEBHOOK_URL:
        return
    try:
        import httpx
        # n8n tiene certificado self-signed: se valida contra su .pem, no se
        # desactiva la verificación.
        verify = settings.ALERTS_N8N_CA_BUNDLE or True
        httpx.post(settings.ALERTS_N8N_WEBHOOK_URL, json=payload, timeout=10, verify=verify)
    except Exception as e:
        logger.warning(f"[Scheduler] No se pudo notificar a n8n: {e}")


def _should_run(db) -> tuple[bool, str]:
    """
    Determina si el job debe ejecutarse hoy.
    Returns (debe_ejecutar, motivo)
    """
    from datetime import date
    from app.services.contract_alerts_service import ContractAlertsService

    hoy = date.today()
    es_lunes = hoy.weekday() == 0  # 0 = lunes

    service = ContractAlertsService(db)
    _, _, modo, _, dias_al_cierre = service._calculate_search_range()
    en_cierre = modo == "cierre"

    if es_lunes and en_cierre:
        return True, f"lunes + modo cierre ({dias_al_cierre} días al cierre)"
    if es_lunes:
        return True, "lunes (ejecución semanal)"
    if en_cierre:
        return True, f"modo cierre activo ({dias_al_cierre} días al cierre)"
    return False, f"día no programado ({hoy.strftime('%A')}), sin modo cierre"


def _run_alerts_job() -> None:
    """Evalúa si debe ejecutar y envía alertas a todos los jefes con alertas pendientes."""
    from app.db.session import SessionLocal
    from app.services.contract_alerts_service import ContractAlertsService
    from datetime import datetime

    timestamp = datetime.now().strftime("%d-%m-%Y %H:%M")
    db = SessionLocal()
    try:
        debe_ejecutar, motivo = _should_run(db)

        if not debe_ejecutar:
            logger.info(f"[Scheduler] Omitido — {motivo}")
            return

        logger.info(f"[Scheduler] Ejecutando — {motivo}")
        service = ContractAlertsService(db)
        result = service.send_alerts_by_boss(bosses_filter=[])

        if result.get("auth_required"):
            msg = "⚠️ Envío automático cancelado: token Microsoft expirado. Re-autorizar en /auth/login."
            logger.error(f"[Scheduler] {msg}")
            _notify_n8n({"tipo": "error_auth", "timestamp": timestamp, "mensaje": msg})
            return

        if result.get("alerts_sent", 0) == 0 and result.get("bosses_failed", 0) == 0:
            logger.info("[Scheduler] Sin alertas pendientes — no se enviaron correos.")
            _notify_n8n({
                "tipo": "sin_alertas",
                "timestamp": timestamp,
                "mensaje": "✅ Scheduler ejecutado — sin alertas pendientes hoy.",
            })
            return

        _notify_n8n({
            "tipo": "envio_completado",
            "timestamp": timestamp,
            "motivo_ejecucion": motivo,
            "resumen": {
                "jefes_notificados": result.get("bosses_successful", 0),
                "jefes_con_error": result.get("bosses_failed", 0),
                "alertas_enviadas": result.get("alerts_sent", 0),
            },
            "detalle_enviados": result.get("detalle_enviados", []),
            "detalle_errores": result.get("detalle_errores", []),
        })

        logger.info(
            f"[Scheduler] Envío completado — "
            f"jefes notificados: {result.get('bosses_successful', 0)}, "
            f"errores: {result.get('bosses_failed', 0)}, "
            f"alertas enviadas: {result.get('alerts_sent', 0)}"
        )
    except Exception as e:
        logger.error(f"[Scheduler] Error inesperado durante envío automático: {e}", exc_info=True)
        _notify_n8n({
            "tipo": "error_inesperado",
            "timestamp": timestamp,
            "mensaje": f"❌ Error inesperado en scheduler de alertas: {str(e)}",
        })
    finally:
        db.close()


def _run_followup_job() -> None:
    """Envía recordatorios a jefaturas sin respuesta."""
    from app.db.session import SessionLocal
    from app.services.contract_alerts_service import ContractAlertsService
    from datetime import datetime

    timestamp = datetime.now().strftime("%d-%m-%Y %H:%M")
    db = SessionLocal()
    try:
        service = ContractAlertsService(db)
        result = service.send_followup_emails()
        if result.get("auth_required"):
            logger.error("[Followup] Token Microsoft expirado")
            return
        logger.info(
            f"[Followup] Completado — enviados: {result.get('sent', 0)}, "
            f"errores: {result.get('errors', 0)}"
        )
        if result.get("sent", 0) > 0:
            _notify_n8n({
                "tipo": "followup_completado",
                "timestamp": timestamp,
                "enviados": result.get("sent", 0),
            })
    except Exception as e:
        logger.error(f"[Followup] Error inesperado: {e}", exc_info=True)
    finally:
        db.close()


def start_scheduler() -> None:
    global _scheduler

    if not (settings.ALERTS_SCHEDULER_ENABLED or settings.OVERTIME_SCHEDULER_ENABLED):
        logger.info("[Scheduler] Deshabilitado (ALERTS_SCHEDULER_ENABLED=False)")
        return

    tz = timezone(settings.ALERTS_SCHEDULER_TIMEZONE)
    _scheduler = BackgroundScheduler(timezone=tz)

    if settings.ALERTS_SCHEDULER_ENABLED:
        _scheduler.add_job(
            _run_alerts_job,
            trigger=CronTrigger(
                hour=settings.ALERTS_SCHEDULER_HOUR,
                minute=settings.ALERTS_SCHEDULER_MINUTE,
                timezone=tz,
            ),
            id="contract_alerts_job",
            name="Envío automático de alertas de contratos",
            replace_existing=True,
        )
        # Follow-up job: mismo horario, corre todos los días
        followup_minute = (settings.ALERTS_SCHEDULER_MINUTE + 5) % 60
        followup_hour = settings.ALERTS_SCHEDULER_HOUR + (1 if settings.ALERTS_SCHEDULER_MINUTE > 54 else 0)
        _scheduler.add_job(
            _run_followup_job,
            trigger=CronTrigger(
                hour=followup_hour,
                minute=followup_minute,
                timezone=tz,
            ),
            id="contract_followup_job",
            name="Recordatorios de seguimiento de contratos",
            replace_existing=True,
        )

    if settings.OVERTIME_SCHEDULER_ENABLED:
        _scheduler.add_job(
            _run_overtime_request_job,
            trigger=CronTrigger(
                day_of_week=settings.OVERTIME_SEND_DAY,
                hour=settings.OVERTIME_SEND_HOUR,
                minute=settings.OVERTIME_SEND_MINUTE,
                timezone=tz,
            ),
            id="overtime_request_job",
            name="Solicitud semanal de horas extras a jefaturas",
            replace_existing=True,
        )
        _scheduler.add_job(
            _run_overtime_summary_job,
            trigger=CronTrigger(
                day_of_week=settings.OVERTIME_DEADLINE_DAY,
                hour=settings.OVERTIME_DEADLINE_HOUR,
                minute=settings.OVERTIME_DEADLINE_MINUTE,
                timezone=tz,
            ),
            id="overtime_summary_job",
            name="Consolidado de horas extras al cierre del plazo",
            replace_existing=True,
        )
        logger.info(
            f"[Scheduler] Jobs horas extras — envío {settings.OVERTIME_SEND_DAY} "
            f"{settings.OVERTIME_SEND_HOUR:02d}:{settings.OVERTIME_SEND_MINUTE:02d}, "
            f"cierre {settings.OVERTIME_DEADLINE_DAY} "
            f"{settings.OVERTIME_DEADLINE_HOUR:02d}:{settings.OVERTIME_DEADLINE_MINUTE:02d}"
        )

    if settings.RETORNO_SCHEDULER_ENABLED:
        _scheduler.add_job(
            _run_retorno_job,
            trigger=CronTrigger(
                hour=settings.RETORNO_SCHEDULER_HOUR,
                minute=settings.RETORNO_SCHEDULER_MINUTE,
                timezone=tz,
            ),
            id="retorno_seguimiento_job",
            name="Reporte diario de retorno post-licencia",
            replace_existing=True,
        )
        logger.info(
            f"[Scheduler] Job retorno registrado — "
            f"{settings.RETORNO_SCHEDULER_HOUR:02d}:{settings.RETORNO_SCHEDULER_MINUTE:02d} "
            f"→ {settings.RETORNO_ALERT_EMAIL or '(sin email configurado)'}"
        )

    _scheduler.start()
    logger.info(
        f"[Scheduler] Iniciado — job diario a las "
        f"{settings.ALERTS_SCHEDULER_HOUR:02d}:{settings.ALERTS_SCHEDULER_MINUTE:02d} "
        f"({settings.ALERTS_SCHEDULER_TIMEZONE}) — ejecuta lunes o cuando modo cierre activo"
    )


def _run_retorno_job() -> None:
    """Envía reporte diario de seguimiento de retorno post-licencia a RRHH."""
    from app.db.session import SessionLocal
    from app.db.session_marcas import MarcasSessionLocal
    from app.services.retorno_service import RetornoService
    from datetime import datetime

    if not settings.RETORNO_ALERT_EMAIL:
        logger.warning("[RetornoScheduler] RETORNO_ALERT_EMAIL no configurado — omitiendo envío.")
        return

    timestamp = datetime.now().strftime("%d-%m-%Y %H:%M")
    db = SessionLocal()
    marcas_db = MarcasSessionLocal()
    try:
        service = RetornoService(db, marcas_db)
        result = service.enviar_alerta_retorno(
            recipient_email=settings.RETORNO_ALERT_EMAIL,
            dias_atras=settings.RETORNO_DIAS_ATRAS,
        )

        if result.get("auth_required"):
            logger.error("[RetornoScheduler] Token Microsoft expirado — re-autorizar en /auth/login.")
            return

        if not result.get("sent"):
            logger.info(f"[RetornoScheduler] Sin envío — {result.get('message')}")
            return

        logger.info(
            f"[RetornoScheduler] Reporte enviado a {settings.RETORNO_ALERT_EMAIL} — "
            f"sin retorno: {result.get('total_sin_retorno', 0)}, "
            f"retornaron: {result.get('total_con_retorno', 0)}"
        )
        _notify_n8n({
            "tipo": "retorno_reporte_enviado",
            "timestamp": timestamp,
            "destinatario": settings.RETORNO_ALERT_EMAIL,
            "sin_retorno": result.get("total_sin_retorno", 0),
            "con_retorno": result.get("total_con_retorno", 0),
        })
    except Exception as e:
        logger.error(f"[RetornoScheduler] Error inesperado: {e}", exc_info=True)
        _notify_n8n({
            "tipo": "retorno_error",
            "timestamp": timestamp,
            "mensaje": f"❌ Error en scheduler de retorno: {str(e)}",
        })
    finally:
        db.close()
        marcas_db.close()


def _run_overtime_request_job() -> None:
    """Envía a cada jefatura su link de selección de horas extras del fin de semana."""
    from app.db.session import SessionLocal
    from app.services.overtime_service import OvertimeService
    from datetime import datetime

    timestamp = datetime.now().strftime("%d-%m-%Y %H:%M")
    db = SessionLocal()
    try:
        result = OvertimeService(db).send_weekly_requests()
        if result.get("auth_required"):
            logger.error("[Overtime] Token Microsoft expirado — re-autorizar en /auth/login.")
            _notify_n8n({
                "tipo": "overtime_error_auth",
                "timestamp": timestamp,
                "mensaje": "⚠️ Horas extras: token Microsoft expirado.",
            })
            return
        logger.info(
            f"[Overtime] Solicitudes — enviadas: {result.get('sent', 0)}, "
            f"errores: {result.get('errors', 0)}"
        )
        _notify_n8n({
            "tipo": "overtime_solicitudes",
            "timestamp": timestamp,
            "enviadas": result.get("sent", 0),
            "errores": result.get("errors", 0),
            "cierre": result.get("deadline"),
        })
    except Exception as e:
        logger.error(f"[Overtime] Error inesperado: {e}", exc_info=True)
        _notify_n8n({
            "tipo": "overtime_error",
            "timestamp": timestamp,
            "mensaje": f"❌ Error en solicitudes de horas extras: {str(e)}",
        })
    finally:
        db.close()


def _run_overtime_summary_job() -> None:
    """Al cerrar el plazo, envía el consolidado de horas extras al destinatario configurado."""
    from app.db.session import SessionLocal
    from app.services.overtime_service import OvertimeService, week_window
    from datetime import datetime, timedelta

    timestamp = datetime.now().strftime("%d-%m-%Y %H:%M")
    db = SessionLocal()
    try:
        # week_window() ya avanzó a la semana siguiente porque el deadline acaba de pasar;
        # el consolidado corresponde a la semana que se está cerrando.
        week_start = week_window()["week_start"] - timedelta(days=7)
        result = OvertimeService(db).send_summary(week_start)
        if result.get("auth_required"):
            logger.error("[Overtime] Token Microsoft expirado — consolidado no enviado.")
            return
        logger.info(f"[Overtime] Consolidado — {result}")
        _notify_n8n({
            "tipo": "overtime_consolidado",
            "timestamp": timestamp,
            "enviado": result.get("sent", False),
            "total": result.get("total", 0),
        })
    except Exception as e:
        logger.error(f"[Overtime] Error en consolidado: {e}", exc_info=True)
    finally:
        db.close()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Detenido")
