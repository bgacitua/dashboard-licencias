"""Reservas de sala del usuario, leídas de Outlook por Microsoft Graph.

Usa el permiso de aplicación `Calendars.Read.All` de la app de Azure de la
plataforma, con flujo client_credentials. Es un token distinto del que usan los
correos (`app/services/email_token_service.py`): ese es delegado, nace de un
refresh token de una persona y solo trae Mail.Send.

Acá no se guarda nada: el calendario es la fuente. Lo que queda en la base es
la copia congelada de la reserva que el usuario eligió (ver `service`).
"""
import threading
from datetime import date, datetime, time, timedelta

import httpx
import pytz
from fastapi import HTTPException

from app.core.config import settings as app_settings
from app.core.logging_config import logger

from .config import settings

GRAPH = "https://graph.microsoft.com/v1.0"

# Token de aplicación cacheado en memoria. Dura una hora y lo comparten todos
# los requests: pedir uno por cada apertura del formulario es un round-trip a
# Azure de más en la ruta caliente del portal.
_token_cache: dict = {"valor": None, "expira": datetime.min.replace(tzinfo=pytz.UTC)}
_lock = threading.Lock()


class CalendarioNoDisponible(HTTPException):
    """Graph no contestó. Es 503 y no 500: lo que falla es un servicio de afuera."""

    def __init__(self, detalle: str = "No pudimos leer tus reservas de sala. Inténtalo de nuevo en un momento."):
        super().__init__(503, detalle)


def _token() -> str:
    ahora = datetime.now(pytz.UTC)
    with _lock:
        if _token_cache["valor"] and _token_cache["expira"] > ahora:
            return _token_cache["valor"]

        if not (app_settings.AZURE_TENANT_ID and app_settings.AZURE_CLIENT_ID and app_settings.AZURE_CLIENT_SECRET):
            raise CalendarioNoDisponible("La integración con el calendario no está configurada.")

        try:
            resp = httpx.post(
                f"https://login.microsoftonline.com/{app_settings.AZURE_TENANT_ID}/oauth2/v2.0/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": app_settings.AZURE_CLIENT_ID,
                    "client_secret": app_settings.AZURE_CLIENT_SECRET,
                    # Permiso de aplicación: el scope es el recurso completo, no
                    # una lista. Los permisos los fija el consentimiento en Azure.
                    "scope": "https://graph.microsoft.com/.default",
                },
                timeout=15,
            )
        except httpx.HTTPError as e:
            logger.warning(f"[Tickets] No se pudo pedir el token de Graph: {e}")
            raise CalendarioNoDisponible()

        if resp.status_code != 200:
            logger.error(f"[Tickets] Azure rechazó el client_credentials: {resp.status_code} {resp.text[:300]}")
            raise CalendarioNoDisponible()

        datos = resp.json()
        _token_cache["valor"] = datos["access_token"]
        # Un minuto de colchón para no usar un token que vence en vuelo.
        _token_cache["expira"] = ahora + timedelta(seconds=int(datos.get("expires_in", 3600)) - 60)
        return _token_cache["valor"]


def _zona():
    return pytz.timezone(settings.zona)


def _instante(dia: date, hora: time) -> datetime:
    return _zona().localize(datetime.combine(dia, hora))


def _es_reserva_de_sala(evento: dict) -> bool:
    """Una reserva de sala es un evento con una sala dentro.

    Graph la marca de dos maneras según cómo se creó: como ubicación de tipo
    `conferenceRoom`, o como invitado de tipo `resource` (el buzón de la sala).
    Con cualquiera de las dos alcanza; un evento sin ninguna es una reunión
    normal y no sirve para pedir un servicio.
    """
    if any(u.get("locationType") == "conferenceRoom" for u in evento.get("locations") or []):
        return True
    return any(a.get("type") == "resource" for a in evento.get("attendees") or [])


def _sala(evento: dict) -> str:
    salas = [
        u.get("displayName") for u in evento.get("locations") or []
        if u.get("locationType") == "conferenceRoom" and u.get("displayName")
    ]
    if salas:
        return ", ".join(salas)
    recursos = [
        (a.get("emailAddress") or {}).get("name") for a in evento.get("attendees") or []
        if a.get("type") == "resource"
    ]
    return ", ".join(r for r in recursos if r) or (evento.get("location") or {}).get("displayName") or "Sala"


def _reserva(evento: dict) -> dict:
    """Traduce el evento de Graph a lo único que le importa al módulo.

    Con el header `Prefer: outlook.timezone` las horas vuelven en hora de Chile
    y sin offset, así que se parten en fecha y hora tal cual vienen.
    """
    inicio = evento["start"]["dateTime"][:19]
    fin = evento["end"]["dateTime"][:19]
    return {
        "id": evento["id"],
        "asunto": (evento.get("subject") or "Sin asunto")[:200],
        "sala": _sala(evento)[:200],
        "fecha": date.fromisoformat(inicio[:10]),
        "hora_inicio": time.fromisoformat(inicio[11:19]),
        "hora_fin": time.fromisoformat(fin[11:19]),
        # Una reserva que cruza la medianoche no sirve como bloque de servicio
        # de un día; se marca acá y el service la rechaza.
        "multidia": inicio[:10] != fin[:10],
    }


def reservas(email: str, desde: date, hasta: date) -> list[dict]:
    """Reservas de sala del usuario entre dos fechas, ambas incluidas."""
    inicio = _instante(desde, time.min)
    fin = _instante(hasta, time.max)
    try:
        resp = httpx.get(
            f"{GRAPH}/users/{email}/calendarView",
            params={
                "startDateTime": inicio.isoformat(),
                "endDateTime": fin.isoformat(),
                "$select": "id,subject,start,end,location,locations,attendees,isCancelled",
                "$orderby": "start/dateTime",
                "$top": 100,
            },
            headers={
                "Authorization": f"Bearer {_token()}",
                # Devuelve las horas en hora de Chile en vez de UTC.
                "Prefer": f'outlook.timezone="{settings.zona}"',
            },
            timeout=20,
        )
    except httpx.HTTPError as e:
        logger.warning(f"[Tickets] Graph no respondió el calendario de {email}: {e}")
        raise CalendarioNoDisponible()

    if resp.status_code == 404:
        # El correo del portal está en la nómina pero no tiene buzón en el tenant.
        raise HTTPException(404, "Tu correo no tiene un calendario en Outlook.")
    if resp.status_code != 200:
        logger.error(f"[Tickets] Graph devolvió {resp.status_code} al leer el calendario: {resp.text[:300]}")
        raise CalendarioNoDisponible()

    return [
        _reserva(e) for e in resp.json().get("value", [])
        if not e.get("isCancelled") and _es_reserva_de_sala(e)
    ]


def buscar_reserva(email: str, reserva_id: str, desde: date, hasta: date) -> dict | None:
    """La reserva con ese id dentro de la ventana, o None.

    Se busca dentro del listado en vez de pedir el evento por id a propósito:
    así una ocurrencia de una serie se resuelve igual que en el portal, y de
    paso queda comprobado que la reserva es de este usuario y cae en la ventana.
    """
    return next((r for r in reservas(email, desde, hasta) if r["id"] == reserva_id), None)
