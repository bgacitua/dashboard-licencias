"""
Scheduler de envío automático de alertas de contratos.
Usa APScheduler con un job diario configurable vía settings.
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from pytz import timezone

from app.core.config import settings
from app.core.logging_config import logger

_scheduler: BackgroundScheduler | None = None


def _run_alerts_job() -> None:
    """Ejecuta el envío de alertas a todos los jefes con alertas pendientes."""
    from app.db.session import SessionLocal
    from app.services.contract_alerts_service import ContractAlertsService
    from app.services.email_token_service import AuthRequiredError

    logger.info("[Scheduler] Iniciando envío automático de alertas de contratos")
    db = SessionLocal()
    try:
        service = ContractAlertsService(db)
        result = service.send_alerts_by_boss(bosses_filter=[])

        if result.get("auth_required"):
            logger.error(
                "[Scheduler] Envío cancelado: se requiere autorización de Microsoft. "
                "Accede a /api/v1/contract-alerts/auth/login para re-autorizar."
            )
            return

        logger.info(
            f"[Scheduler] Envío completado — "
            f"jefes notificados: {result.get('bosses_successful', 0)}, "
            f"errores: {result.get('bosses_failed', 0)}, "
            f"alertas enviadas: {result.get('alerts_sent', 0)}"
        )
    except Exception as e:
        logger.error(f"[Scheduler] Error inesperado durante envío automático: {e}", exc_info=True)
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
        id="contract_alerts_daily",
        name="Envío automático de alertas de contratos",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        f"[Scheduler] Iniciado — job diario a las "
        f"{settings.ALERTS_SCHEDULER_HOUR:02d}:{settings.ALERTS_SCHEDULER_MINUTE:02d} "
        f"({settings.ALERTS_SCHEDULER_TIMEZONE})"
    )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Detenido")
