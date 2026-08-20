"""
Integración con Duo Security (Universal Prompt) para la verificación en dos pasos.

Flujo:
  1. Credenciales OK  -> se genera un `state` firmado (JWT corto) y una URL al
     prompt de Duo. El frontend redirige el navegador a esa URL.
  2. Duo autentica al usuario y redirige a DUO_REDIRECT_URI con `state` y `duo_code`.
  3. El frontend envía ambos al backend, que valida el `state` e intercambia el
     `duo_code` con Duo. Si el resultado es válido, se emite el JWT de sesión.

El enrolamiento de dispositivos lo administra Duo, no esta aplicación.
"""
import logging
from functools import lru_cache

from duo_universal.client import Client, DuoException

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_duo_client() -> Client:
    """Cliente Duo compartido. lru_cache = una sola instancia por proceso."""
    missing = [
        name for name in ("DUO_CLIENT_ID", "DUO_CLIENT_SECRET", "DUO_API_HOST")
        if not getattr(settings, name)
    ]
    if missing:
        raise RuntimeError(f"Duo no está configurado. Faltan variables: {', '.join(missing)}")

    return Client(
        client_id=settings.DUO_CLIENT_ID,
        client_secret=settings.DUO_CLIENT_SECRET,
        host=settings.DUO_API_HOST,
        redirect_uri=settings.DUO_REDIRECT_URI,
    )


def create_auth_url(duo_username: str, state: str) -> str:
    """
    URL del prompt de Duo para `duo_username`.

    `state` es nuestro pre_auth_token firmado: viaja a Duo y vuelve intacto en
    el callback, así que no necesitamos almacenar sesiones del lado del servidor.

    Raises:
        RuntimeError: Duo no configurado o no disponible.
    """
    client = get_duo_client()
    try:
        # health_check falla rápido si Duo está caído o las credenciales son inválidas.
        client.health_check()
        return client.create_auth_url(duo_username, state)
    except DuoException as e:
        logger.error(f"Error al contactar a Duo para {duo_username}: {e}")
        raise RuntimeError("El servicio de verificación en dos pasos no está disponible.") from e


def verify_duo_code(duo_code: str, duo_username: str) -> bool:
    """
    Intercambia el código de autorización con Duo. True si la 2FA fue exitosa.

    Duo valida internamente que el `preferred_username` del token devuelto
    coincida con `duo_username`, y lanza DuoException si no es así.
    """
    client = get_duo_client()
    try:
        client.exchange_authorization_code_for_2fa_result(duo_code, duo_username)
        return True
    except DuoException as e:
        logger.warning(f"Verificación Duo fallida para {duo_username}: {e}")
        return False
