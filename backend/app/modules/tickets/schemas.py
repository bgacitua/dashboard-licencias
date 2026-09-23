from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Estado = Literal["pendiente", "en_curso", "rechazado", "cerrado"]

# Tope del JSON de una respuesta. Los campos los define el admin, pero el body
# lo arma el navegador: sin techo, cualquiera con cuenta llena la tabla.
MAX_DATOS = 64 * 1024


def _datos_acotados(v: dict) -> dict:
    import json

    if len(json.dumps(v, ensure_ascii=False)) > MAX_DATOS:
        raise ValueError("La solicitud es demasiado grande.")
    return v


# === Cuenta del portal ===

# Regex en vez de EmailStr, igual que asistencia: evita sumar email-validator.
# El correo igual se contrasta contra la nómina, que es la validación real.
Email = Field(..., max_length=150, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegistroIn(BaseModel):
    email: str = Email
    # Clave sencilla a propósito (pedido del negocio): la protegen la nómina, la
    # activación del admin y el rate limit, no la complejidad.
    password: str = Field(..., min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: str = Email
    password: str = Field(..., max_length=128)


class CambioClaveIn(BaseModel):
    actual: str = Field(..., max_length=128)
    nueva: str = Field(..., min_length=8, max_length=128)


class SesionOut(BaseModel):
    token: str
    nombre: str | None
    email: str


class MeOut(BaseModel):
    nombre: str | None
    email: str


# === Tipos ===

class TipoBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=120)
    descripcion: str | None = None
    portada_url: str | None = None
    definicion: dict = Field(default_factory=lambda: {"pages": []})
    tema: dict | None = None
    dias_anticipacion: int = Field(1, ge=0, le=60)
    hora_limite: time = time(12, 0)
    activo: bool = True
    orden: int = 0


class TipoCreate(TipoBase):
    slug: str = Field(..., min_length=1, max_length=80, pattern=r"^[a-z0-9][a-z0-9-]*$")


class TipoUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=120)
    descripcion: str | None = None
    portada_url: str | None = None
    definicion: dict | None = None
    tema: dict | None = None
    dias_anticipacion: int | None = Field(None, ge=0, le=60)
    hora_limite: time | None = None
    activo: bool | None = None
    orden: int | None = None


class TipoOut(TipoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str


# === Tickets ===

class TicketIn(BaseModel):
    tipo_id: int
    fecha_servicio: date
    datos: dict

    _v = field_validator("datos")(_datos_acotados)


class TicketEdit(BaseModel):
    fecha_servicio: date
    datos: dict
    # La versión que el usuario tenía abierta. Si otra pestaña guardó entre
    # medio, se rechaza en vez de pisar esa versión en silencio.
    version: int

    _v = field_validator("datos")(_datos_acotados)


class ComentarioIn(BaseModel):
    texto: str = Field(..., min_length=1, max_length=2000)


class EstadoIn(BaseModel):
    estado: Estado
    comentario: str | None = Field(None, max_length=2000)


class VersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version: int
    fecha_servicio: date
    datos: dict
    created_at: datetime


class EventoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    autor: str
    es_admin: bool
    estado_nuevo: str | None
    texto: str | None
    created_at: datetime


class TicketResumen(BaseModel):
    id: int
    tipo_id: int
    tipo: str
    estado: str
    fecha_servicio: date
    plazo: datetime
    editable: bool
    version_actual: int
    created_at: datetime
    updated_at: datetime
    # Solo en el panel.
    usuario: str | None = None
    email: str | None = None
    modificado: bool = False


class TicketDetalle(TicketResumen):
    datos: dict
    versiones: list[VersionOut] = []
    eventos: list[EventoOut] = []


# === Usuarios (panel) ===

class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    nombre: str | None
    rut: str | None
    estado: str
    tiene_clave: bool = True
    reset_hasta: datetime | None
    activado_por: str | None
    last_login_at: datetime | None
    created_at: datetime


class UsuarioEstadoIn(BaseModel):
    estado: Literal["activo", "inactivo"]


class ArchivoOut(BaseModel):
    id: str
    url: str
