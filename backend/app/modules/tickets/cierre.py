"""Barrido que cierra las solicitudes cuyo día de servicio ya pasó.

Vive aparte de `service.py` porque es lo único del módulo que corre sin que
nadie pida nada: lo dispara el scheduler de la plataforma, que le pasa su
instancia y su zona (mismo contrato que `asistencia/ausencias.py`).

La regla de qué se cierra está en `logica.cierra_automaticamente` y el barrido
en `service.cerrar_vencidos`; acá solo queda abrir la sesión, no dejar que un
error tumbe el scheduler y cerrarla.
"""
from app.core.logging_config import logger
from app.db.session import SessionLocal

from . import service
from .config import get_settings


def job_habilitado() -> bool:
    """Sin el módulo encendido no hay nada que cerrar."""
    return get_settings().enabled


def correr_job() -> dict:
    db = SessionLocal()
    try:
        cerradas = service.cerrar_vencidos(db)
        logger.info("[tickets/cierre] %d solicitud(es) cerradas automáticamente.", cerradas)
        return {"cerradas": cerradas}
    except Exception as exc:
        # Un job caído no puede tumbar el scheduler: en el mismo proceso corren
        # las alertas de contratos y el resto de la plataforma.
        logger.error("[tickets/cierre] job falló: %s", exc, exc_info=True)
        return {"error": str(exc)}
    finally:
        db.close()


def registrar_job(scheduler, _tz) -> None:
    """Registra el barrido diario. Lo llama el scheduler de la plataforma.

    La zona del disparo es la del módulo (`TICKETS_ZONA`) y no la del
    scheduler: `cerrar_vencidos` decide qué día ya pasó con esa misma zona, y
    si las dos no coinciden el barrido cerraría un día de más o de menos.
    """
    import pytz
    from apscheduler.triggers.cron import CronTrigger

    s = get_settings()
    scheduler.add_job(
        correr_job,
        trigger=CronTrigger(hour=s.cierre_hora, minute=s.cierre_minuto, timezone=pytz.timezone(s.zona)),
        id="tickets_cierre_job",
        name="Cierre automático de solicitudes del día anterior",
        replace_existing=True,
    )
    logger.info(
        "[Scheduler] Job cierre de tickets registrado — %02d:%02d",
        s.cierre_hora, s.cierre_minuto,
    )
