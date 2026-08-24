"""Router del módulo de asistencia.

Contrato con la plataforma — este módulo importa exactamente tres cosas de
fuera de su carpeta, y nada más:

    app.core.security.require_module   -> autorización
    app.db.deps.get_db                 -> sesión SQLAlchemy
    app.core.logging_config.logger     -> logs

Cualquier import adicional hacia `app.*` es acoplamiento: revisarlo antes de
agregarlo.
"""
from fastapi import APIRouter, Depends

from app.core.security import require_module
from app.core.logging_config import logger

from .config import settings

# require_module("asistencia") exige la fila en app.modulos y su asignación al
# rol. Aplicado a nivel de router: ningún endpoint del módulo queda expuesto
# por olvido.
router = APIRouter(dependencies=[Depends(require_module("asistencia"))])


@router.get("/health")
def health():
    """Estado del módulo y de sus dependencias externas."""
    return {
        "modulo": "asistencia",
        "dry_run": settings.DRY_RUN,
        "ctrl_configurado": bool(settings.CTRL_TOKEN.get_secret_value()),
    }
