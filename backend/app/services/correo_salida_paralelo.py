"""Aviso paralelo de salida de personal.

Se dispara junto al aviso de salida de `desvinculacion_service`, pero es
independiente: va a otra casilla (SALIDA_PERSONAL_PARALELO_TO) y el cuerpo
cambia según el tipo de contrato del trabajador. Si falla, no debe tumbar el
aviso principal.
"""

import logging

from app.core.config import settings
from app.schemas.desvinculacion import CorreoSalidaRequest
from app.services.correo_salida_paralelo_template import asunto, cuerpo
from app.services.desvinculacion_service import MOTIVOS_SALIDA
from app.services.email_service import send_email_graph

logger = logging.getLogger(__name__)


def enviar_correo_salida_paralelo(rut: str, data: CorreoSalidaRequest) -> bool:
    """Envía el aviso paralelo. Devuelve False si no está configurado o si falló."""
    if not settings.SALIDA_PERSONAL_PARALELO_TO:
        return False
    try:
        return send_email_graph(
            to=settings.SALIDA_PERSONAL_PARALELO_TO,
            cc="",
            subject=asunto(data.nombre_trabajador),
            html_body=cuerpo(
                nombre_trabajador=data.nombre_trabajador,
                rut=rut,
                cargo=data.cargo,
                fecha_salida=data.fecha_salida,
                motivo_texto=MOTIVOS_SALIDA[data.motivo],
                tipo_contrato=data.tipo_contrato,
            ),
            sender=settings.SALIDA_PERSONAL_FROM,
        )
    except Exception:
        logger.exception("Falló el aviso paralelo de salida para %s", rut)
        return False
