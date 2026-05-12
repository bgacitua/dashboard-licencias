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
        httpx.post(settings.ALERTS_N8N_WEBHOOK_URL, json=payload, timeout=10)
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

    if not settings.ALERTS_SCHEDULER_ENABLED:
        logger.info("[Scheduler] Deshabilitado (ALERTS_SCHEDULER_ENABLED=False)")
        return

    tz = timezone(settings.ALERTS_SCHEDULER_TIMEZONE)
    _scheduler = BackgroundScheduler(timezone=tz)
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
    _scheduler.start()
    logger.info(
        f"[Scheduler] Iniciado — job diario a las "
        f"{settings.ALERTS_SCHEDULER_HOUR:02d}:{settings.ALERTS_SCHEDULER_MINUTE:02d} "
        f"({settings.ALERTS_SCHEDULER_TIMEZONE}) — ejecuta lunes o cuando modo cierre activo"
    )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Detenido")
