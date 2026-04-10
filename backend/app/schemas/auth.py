"""
Schemas Pydantic para autenticación y gestión de usuarios.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# === Schemas de Autenticación ===

class Token(BaseModel):
    """Respuesta del endpoint de login"""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Datos extraídos del token JWT"""
    username: Optional[str] = None


class LoginRequest(BaseModel):
    """Request para login"""
    username: str
    password: str


# === Schemas de Módulos ===

class ModuloBase(BaseModel):
    """Datos base de un módulo"""
    codigo: str
    nombre: str
    descripcion: Optional[str] = None
    icono: Optional[str] = None
    ruta: Optional[str] = None


class ModuloResponse(ModuloBase):
    """Respuesta con datos de módulo"""
    id: int
    orden: int
    activo: bool
    
    class Config:
        from_attributes = True


# === Schemas de Roles ===

class RoleBase(BaseModel):
    """Datos base de un rol"""
    nombre: str
    descripcion: Optional[str] = None


class RoleResponse(RoleBase):
    """Respuesta con datos de rol"""
    id: int
    
    class Config:
        from_attributes = True


class RoleWithModules(RoleResponse):
    """Rol con sus módulos permitidos"""
    modulos: List[ModuloResponse] = []


# === Schemas de Usuario ===

class UsuarioBase(BaseModel):
    """Datos base de usuario"""
    username: str
    email: Optional[str] = None
    nombre_completo: Optional[str] = None


class UsuarioCreate(UsuarioBase):
    """Request para crear usuario"""
    password: str
    rol_id: int
    modulo_ids: Optional[List[int]] = None  # Módulos específicos del usuario


class UsuarioUpdate(BaseModel):
    """Request para actualizar usuario"""
    email: Optional[str] = None
    nombre_completo: Optional[str] = None
    rol_id: Optional[int] = None
    activo: Optional[bool] = None
    password: Optional[str] = None  # Solo si se quiere cambiar
    modulo_ids: Optional[List[int]] = None  # Módulos específicos del usuario


class UsuarioResponse(UsuarioBase):
    """Respuesta con datos de usuario (sin password)"""
    id: int
    activo: bool
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    rol: Optional[RoleResponse] = None
    modulos: List[ModuloResponse] = []  # Módulos directos del usuario
    
    class Config:
        from_attributes = True


class UsuarioWithModules(UsuarioResponse):
    """Usuario con sus módulos permitidos"""
    modulos: List[ModuloResponse] = []


# === Schemas de Respuesta de Auth ===

class AuthResponse(BaseModel):
    """Respuesta completa del login"""
    access_token: str
    token_type: str = "bearer"
    user: UsuarioResponse
    modulos: List[ModuloResponse]


class MeResponse(BaseModel):
    """Respuesta del endpoint /me"""
    user: UsuarioResponse
    modulos: List[ModuloResponse]
