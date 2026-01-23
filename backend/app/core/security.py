"""
Módulo de seguridad para autenticación JWT y hashing de passwords.
"""
from datetime import datetime, timedelta
from typing import Optional
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


async def get_current_user(
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
    if payload is None:
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


async def get_current_active_user(
    current_user: Usuario = Depends(get_current_user)
) -> Usuario:
    """Verifica que el usuario actual esté activo."""
    if not current_user.activo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Usuario inactivo"
        )
    return current_user


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
    async def role_checker(
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
    async def module_checker(
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
