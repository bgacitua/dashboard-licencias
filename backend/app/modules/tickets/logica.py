"""Reglas puras del módulo: plazo, estados, sniff de imágenes y clave del JWT.

Sin base ni FastAPI, para que el self-check las pruebe sin nada levantado.
"""
import hashlib
from datetime import date, datetime, time, timedelta

import pytz

ESTADOS = ("pendiente", "en_curso", "rechazado", "cerrado")


def calcular_plazo(fecha_servicio: date, dias: int, hora: time, zona: str) -> datetime:
    """Hasta cuándo se puede pedir o editar: `dias` antes del servicio a `hora`,
    hora local. Con pytz y no zoneinfo: la imagen slim no garantiza tzdata del
    sistema y pytz trae la suya."""
    local = datetime.combine(fecha_servicio - timedelta(days=dias), hora)
    return pytz.timezone(zona).localize(local)


def editable(estado: str, plazo: datetime, ahora: datetime) -> bool:
    """Solo lo pendiente y dentro de plazo. En curso, rechazado o cerrado ya es
    del admin: editarlo cambiaría algo que otro está atendiendo."""
    return estado == "pendiente" and ahora < plazo


# Firmas de los formatos que se aceptan. SVG queda fuera a propósito: es XML con
# script, y la imagen se sirve desde el mismo origen que la plataforma.
_FIRMAS = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)


def mime_de_imagen(datos: bytes) -> str | None:
    """Tipo real según los primeros bytes; el Content-Type que manda el
    navegador lo elige quien sube el archivo."""
    for firma, mime in _FIRMAS:
        if datos.startswith(firma):
            return mime
    if datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        return "image/webp"
    return None


def clave_jwt(secreto_plataforma: str) -> str:
    """Clave del JWT del portal, derivada de la de la plataforma.

    Distinta a propósito: con la misma clave, un token del portal cuyo `sub`
    coincidiera con un username pasaría get_current_user de la plataforma. Así
    no hace falta otro secreto en el .env y los dos mundos no se cruzan.
    """
    return hashlib.sha256(f"tickets|{secreto_plataforma}".encode()).hexdigest()
