"""
Schemas Pydantic para autenticación y gestión de usuarios.
"""
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime

CORPORATE_DOMAIN = "cramer.cl"


def validate_corporate_email(email: Optional[str]) -> Optional[str]:
    if email is None:
        return email
    if not email.lower().endswith(f"@{CORPORATE_DOMAIN}"):
        raise ValueError(f"El correo debe ser @{CORPORATE_DOMAIN}")
    return email.lower()


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


class RoleCreate(RoleBase):
    """Request para crear un rol"""
    modulo_ids: Optional[List[int]] = []


class RoleUpdate(BaseModel):
    """Request para actualizar un rol"""
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    modulo_ids: Optional[List[int]] = None


# === Schemas de Usuario ===

class UsuarioBase(BaseModel):
    """Datos base de usuario"""
    username: str
    email: Optional[str] = None
    nombre_completo: Optional[str] = None


class UsuarioCreate(UsuarioBase):
    """Request para crear usuario"""
    password: Optional[str] = None  # None cuando se envía invitación al usuario
    send_invite: bool = False        # True → generar token e invitar por email
    rol_id: int
    email: str  # Obligatorio y debe ser @cramer.cl
    modulo_ids: Optional[List[int]] = None

    @field_validator('email')
    @classmethod
    def email_must_be_corporate(cls, v):
        return validate_corporate_email(v)


class SetPasswordRequest(BaseModel):
    """Request para que el usuario establezca su contraseña via token de invitación"""
    token: str
    password: str


class UsuarioUpdate(BaseModel):
    """Request para actualizar usuario"""
    email: Optional[str] = None  # None = sin cambios; nunca se puede dejar vacío
    nombre_completo: Optional[str] = None
    rol_id: Optional[int] = None
    activo: Optional[bool] = None
    password: Optional[str] = None
    modulo_ids: Optional[List[int]] = None

    @field_validator('email')
    @classmethod
    def email_must_be_corporate(cls, v):
        return validate_corporate_email(v)


class UsuarioResponse(UsuarioBase):
    """Respuesta con datos de usuario (sin password)"""
    id: int
    activo: bool
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    rol: Optional[RoleResponse] = None
    modulos: List[ModuloResponse] = []  # Módulos directos del usuario
    invite_pending: bool = False       # invitación vigente sin canjear
    invite_email_failed: bool = False  # el usuario se creó pero el correo no salió

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
    # Casilla a la que se desvía todo el correo saliente. Vacío = envío normal.
    # La UI muestra un aviso mientras tenga valor, para que nadie crea que los
    # correos llegaron a las jefaturas.
    email_test_redirect: str = ""


# === Schemas de 2FA (Duo Universal Prompt) ===

class PreAuthResponse(BaseModel):
    """Credenciales ok — el navegador debe redirigirse al prompt de Duo."""
    requires_2fa: bool = True
    duo_auth_url: str


class DuoCallbackRequest(BaseModel):
    """Parámetros que Duo devuelve en el redirect, reenviados por el frontend."""
    state: str
    duo_code: str

