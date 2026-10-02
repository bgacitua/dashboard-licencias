"""Aviso paralelo de salida de personal.

Se dispara junto al aviso de salida de `desvinculacion_service`, pero es
independiente: va a otra casilla (SALIDA_PERSONAL_PARALELO_TO) y sus datos
salen de la BD, no del formulario. Si falla, no debe tumbar el aviso principal.
"""

import logging
from datetime import date

from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories.desvinculacion_repository import DesvinculacionRepository
from app.services.correo_salida_paralelo_template import asunto, cuerpo
from app.services.email_service import send_email_graph

logger = logging.getLogger(__name__)


def enviar_correo_salida_paralelo(db: Session, rut: str, fecha_salida: date) -> bool:
    """Envía el aviso paralelo. Devuelve False si no está configurado o si falló."""
    if not settings.SALIDA_PERSONAL_PARALELO_TO:
        return False
    try:
        datos = DesvinculacionRepository(db).get_datos_aviso_paralelo(rut)
        if not datos:
            logger.warning("Sin datos en rh.employees para %s; no se envía el aviso paralelo", rut)
            return False
        return send_email_graph(
            to=settings.SALIDA_PERSONAL_PARALELO_TO,
            cc=settings.SALIDA_PERSONAL_PARALELO_CC,
            bcc=settings.SALIDA_PERSONAL_PARALELO_BCC,
            subject=asunto(datos["empresa"]),
            html_body=cuerpo(
                nombre_trabajador=datos["nombre_trabajador"],
                rut_trabajador=datos["rut_trabajador"],
                empresa=datos["empresa"],
                contract_type=datos["contract_type"],
                fecha_salida=fecha_salida,
            ),
            sender=settings.SALIDA_PERSONAL_FROM,
        )
    except Exception:
        logger.exception("Falló el aviso paralelo de salida para %s", rut)
        return False
