"""Sesión del portal de tickets. Independiente de la de la plataforma.

El JWT se firma con una clave derivada (ver logica.clave_jwt) y lleva
`token_type = "tickets"`: no sirve fuera del portal y los de la plataforma no
sirven dentro.
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.db.deps import get_db

from .config import settings
from .logica import clave_jwt
from .models import TkUsuario

_KEY = clave_jwt(app_settings.JWT_SECRET_KEY)
_ALG = "HS256"
_TIPO = "tickets"

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer = OAuth2PasswordBearer(tokenUrl="/api/v1/tickets/portal/login", auto_error=False)

# Hash fijo para comparar cuando el correo no existe: el login tarda lo mismo
# exista o no la cuenta, y el tiempo de respuesta no sirve para listar correos.
HASH_SEÑUELO = pwd.hash("señuelo-sin-uso")


def crear_token(usuario: TkUsuario) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.sesion_horas)
    return jwt.encode({"sub": str(usuario.id), "token_type": _TIPO, "exp": exp}, _KEY, algorithm=_ALG)


def _id_del_token(token: str | None) -> int | None:
    if not token:
        return None
    try:
        payload = jwt.decode(token, _KEY, algorithms=[_ALG])
    except JWTError:
        return None
    if payload.get("token_type") != _TIPO:
        return None
    try:
        return int(payload["sub"])
    except (KeyError, ValueError):
        return None


def usuario_actual(token: str | None = Depends(_bearer), db: Session = Depends(get_db)) -> TkUsuario:
    """El estado se relee en cada request: desactivar a alguien en el panel lo
    saca en su próximo click, sin esperar a que venza el token."""
    uid = _id_del_token(token)
    usuario = db.get(TkUsuario, uid) if uid else None
    if not usuario or usuario.estado != "activo" or not usuario.password_hash:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Tu sesión no es válida. Vuelve a ingresar.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return usuario


UsuarioPortal = Annotated[TkUsuario, Depends(usuario_actual)]
