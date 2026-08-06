import json
from pathlib import Path

import httpx

from app.core.config import settings
from app.core.logging_config import logger


class AuthRequiredError(Exception):
    pass


def _token_path() -> Path:
    return Path(settings.TOKEN_STORAGE_PATH)


def save_tokens(access_token: str, refresh_token: str) -> None:
    path = _token_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"refresh_token": refresh_token}))
    logger.info("Tokens de Microsoft guardados exitosamente")


def get_access_token() -> str:
    """Obtiene un access token fresco usando el refresh token almacenado."""
    path = _token_path()
    if not path.exists():
        raise AuthRequiredError("No hay sesión de Microsoft autorizada")

    data = json.loads(path.read_text())
    refresh_token = data.get("refresh_token")
    if not refresh_token:
        raise AuthRequiredError("Token de Microsoft inválido o expirado")

    resp = httpx.post(
        f"https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/oauth2/v2.0/token",
        data={
            "grant_type": "refresh_token",
            "client_id": settings.AZURE_CLIENT_ID,
            "client_secret": settings.AZURE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            # Mail.Send.Shared permite enviar desde buzones compartidos (SendAs).
            "scope": "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.Send.Shared offline_access",
        },
        timeout=15,
    )

    if resp.status_code != 200:
        error = resp.json().get("error", "")
        if error in ("invalid_grant", "interaction_required"):
            path.unlink(missing_ok=True)
            raise AuthRequiredError("Sesión de Microsoft expirada, se requiere nueva autorización")
        resp.raise_for_status()

    token_data = resp.json()
    if "refresh_token" in token_data:
        save_tokens(token_data["access_token"], token_data["refresh_token"])

    return token_data["access_token"]


def clear_tokens() -> None:
    path = _token_path()
    if path.exists():
        path.unlink()
