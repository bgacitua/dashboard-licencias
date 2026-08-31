"""
Módulo de seguridad para autenticación JWT y hashing de passwords.
"""
from datetime import datetime, timedelta
from typing import Optional
import threading
import time
import uuid
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.models.auth import Usuario, Modulo

# Configuración de hashing de passwords
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Esquema OAuth2 para extraer token del header Authorization
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica si una contraseña plana coincide con su hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Genera el hash bcrypt de una contraseña."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Crea un JWT con los datos proporcionados.
    
    Args:
        data: Diccionario con datos a incluir en el token (ej: {"sub": username})
        expires_delta: Tiempo de expiración opcional
    
    Returns:
        Token JWT codificado como string
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, 
        settings.JWT_SECRET_KEY, 
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def create_pre_auth_token(user_id: int, username: str, duo_username: str) -> str:
    """
    JWT de vida corta (5 min) emitido tras validar la contraseña.

    Se usa como `state` en el redirect a Duo: viaja al prompt y vuelve en el
    callback, de modo que la sesión intermedia no necesita almacenarse.
    Al ir firmado, un state manipulado no supera la validación.
    """
    data = {"sub": username, "user_id": user_id, "duo_username": duo_username, "token_type": "pre_2fa"}
    return create_access_token(data, expires_delta=timedelta(minutes=5))


def decode_pre_auth_token(token: str) -> Optional[dict]:
    payload = decode_access_token(token)
    if payload is None or payload.get("token_type") != "pre_2fa":
        return None
    return payload


def decode_access_token(token: str) -> Optional[dict]:
    """
    Decodifica un JWT y retorna su payload.
    
    Returns:
        Diccionario con los datos del token, o None si es inválido
    """
    try:
        payload = jwt.decode(
            token, 
            settings.JWT_SECRET_KEY, 
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Usuario:
    """
    Dependencia FastAPI que obtiene el usuario actual desde el token JWT.
    
    Raises:
        HTTPException 401: Si el token es inválido o el usuario no existe
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None or payload.get("token_type") == "pre_2fa":
        raise credentials_exception

    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if user is None:
        raise credentials_exception
    
    if not user.activo:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario desactivado"
        )
    
    return user


def get_current_active_user(
    current_user: Usuario = Depends(get_current_user)
) -> Usuario:
    """Verifica que el usuario actual esté activo."""
    if not current_user.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Usuario inactivo"
        )
    return current_user


def create_response_token(employee_id: int, rut: str, boss_email: str, alert_date: str) -> str:
    """JWT con expiración de 15 días para links de respuesta en correos de alertas de contratos."""
    data = {
        "token_type": "contract_response",
        "employee_id": employee_id,
        "rut": rut,
        "boss_email": boss_email,
        "alert_date": alert_date,
        "jti": str(uuid.uuid4()),
    }
    return create_access_token(data, expires_delta=timedelta(days=15))


def decode_response_token(token: str) -> Optional[dict]:
    """Decodifica token de respuesta. Retorna payload o None si inválido o expirado."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("token_type") != "contract_response":
            return None
        return payload
    except JWTError:
        return None


def create_oauth_state_token(username: str) -> str:
    """`state` firmado para el OAuth de Microsoft de las alertas de contratos.

    Lo emite /auth/login, que exige sesión y rol. Vuelve en el callback y se
    valida ahí: sin él, cualquiera podría completar el consentimiento con SU
    cuenta y quedar como remitente de todos los correos de la plataforma.
    Vida corta porque solo tiene que sobrevivir al prompt de Microsoft.
    """
    data = {"token_type": "ms_oauth_state", "sub": username, "jti": str(uuid.uuid4())}
    return create_access_token(data, expires_delta=timedelta(minutes=15))


def decode_oauth_state_token(token: str) -> Optional[dict]:
    """Valida el `state` del callback. Retorna payload o None si no sirve.

    No lo marca como usado: para el canje real usar consume_oauth_state_token.
    """
    payload = decode_access_token(token)
    if payload is None or payload.get("token_type") != "ms_oauth_state":
        return None
    return payload


# jti de los `state` ya canjeados, con el momento en que dejan de importar.
# ponytail: vive en el proceso. Con varios workers de uvicorn cada uno tendría
# su propio registro y un state podría gastarse una vez por worker; si algún día
# se levanta multi-worker, mover esto a una tabla o a Redis. Reiniciar el
# backend lo vacía, y eso está bien: los state vivos duran 15 minutos.
_oauth_states_usados: dict[str, float] = {}
_oauth_states_lock = threading.Lock()


def consume_oauth_state_token(token: str) -> Optional[dict]:
    """Valida el `state` y lo quema: un segundo intento con el mismo devuelve None.

    Sin esto, quien consiga un state válido (queda en la URL, en el historial,
    en logs) puede rehacer el flujo con SU cuenta de Microsoft dentro de los 15
    minutos de vida del token y quedar como remitente de los correos.
    """
    payload = decode_oauth_state_token(token)
    if payload is None:
        return None

    jti = payload.get("jti")
    if jti is None:
        return None

    ahora = time.time()
    with _oauth_states_lock:
        # Barrer los vencidos: ya no los acepta la validación de firma, así que
        # recordarlos no aporta. Son pocos, no hace falta barrer por lotes.
        for viejo in [k for k, exp in _oauth_states_usados.items() if exp < ahora]:
            del _oauth_states_usados[viejo]

        if jti in _oauth_states_usados:
            return None

        # `exp` viene del propio token: el registro se olvida del jti justo
        # cuando el token deja de ser valido por su cuenta.
        _oauth_states_usados[jti] = float(payload.get("exp", ahora + 900))

    return payload


def create_overtime_token(boss_rut: str, boss_email: str, week_start: str, expires_in: timedelta) -> str:
    """JWT para el link de selección de horas extras. Expira exactamente en el deadline de cierre."""
    data = {
        "token_type": "overtime_selection",
        "boss_rut": boss_rut,
        "boss_email": boss_email,
        "week_start": week_start,
        "jti": str(uuid.uuid4()),
    }
    return create_access_token(data, expires_delta=expires_in)


def decode_overtime_token(token: str) -> Optional[dict]:
    """Decodifica token de horas extras. Retorna payload o None si inválido o expirado."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("token_type") != "overtime_selection":
            return None
        return payload
    except JWTError:
        return None


def require_role(allowed_roles: list[str]):
    """
    Crea una dependencia que verifica si el usuario tiene uno de los roles permitidos.
    
    Args:
        allowed_roles: Lista de nombres de roles permitidos (ej: ["admin", "rrhh"])
    
    Usage:
        @router.get("/admin-only")
        async def admin_route(user: Usuario = Depends(require_role(["admin"]))):
            ...
    """
    def role_checker(
        current_user: Usuario = Depends(get_current_user)
    ) -> Usuario:
        if current_user.rol is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario sin rol asignado"
            )
        
        if current_user.rol.nombre not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado. Rol requerido: {', '.join(allowed_roles)}"
            )
        
        return current_user
    
    return role_checker


def require_module(module_code: str):
    """
    Crea una dependencia que verifica si el usuario tiene acceso a un módulo específico.
    
    Args:
        module_code: Código del módulo (ej: "dashboard", "finiquitos", "admin")
    
    Usage:
        @router.get("/finiquitos")
        async def finiquitos_route(user: Usuario = Depends(require_module("finiquitos"))):
            ...
    """
    def module_checker(
        current_user: Usuario = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> Usuario:
        if current_user.rol is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuario sin rol asignado"
            )
        
        # Verificar si el rol del usuario tiene acceso al módulo
        module = db.query(Modulo).filter(
            Modulo.codigo == module_code,
            Modulo.activo == True
        ).first()
        
        if module is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Módulo '{module_code}' no encontrado"
            )
        
        # Verificar si el módulo está en los permisos del rol
        if module not in current_user.rol.modulos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No tienes acceso al módulo '{module.nombre}'"
            )
        
        return current_user
    
    return module_checker
