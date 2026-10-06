from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Estado = Literal["pendiente", "en_curso", "rechazado", "cerrado"]
ModoCobro = Literal["fijo", "cantidad"]

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
    # `name` de la pregunta que multiplica a los servicios cobrados por unidad.
    pregunta_cantidad: str | None = Field(None, max_length=80)


class TipoCreate(TipoBase):
    pass


class TipoUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=120)
    descripcion: str | None = None
    portada_url: str | None = None
    definicion: dict | None = None
    tema: dict | None = None
    dias_anticipacion: int | None = Field(None, ge=0, le=60)
    hora_limite: time | None = None
    activo: bool | None = None
    pregunta_cantidad: str | None = Field(None, max_length=80)


class TipoOut(TipoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


# === Catálogo de servicios ===

class ServicioBase(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=160)
    descripcion: str | None = None
    modo: ModoCobro = "fijo"
    activo: bool = True


class ServicioCreate(ServicioBase):
    # Precio inicial opcional: un servicio puede nacer sin tarifa cargada.
    valor: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    desde: date | None = None


class ServicioUpdate(BaseModel):
    nombre: str | None = Field(None, min_length=1, max_length=160)
    descripcion: str | None = None
    modo: ModoCobro | None = None
    activo: bool | None = None


class PrecioIn(BaseModel):
    """Alta de un precio. No se edita el anterior: se cierra y entra este."""

    valor: Decimal = Field(..., ge=0, max_digits=12, decimal_places=2)
    desde: date


class PrecioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    valor: Decimal
    desde: date
    hasta: date | None
    creado_por: str | None


class ServicioOut(ServicioBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # Precio al día de hoy; None si todavía no tiene tarifa vigente.
    valor_vigente: Decimal | None = None


class ServicioDetalle(ServicioOut):
    precios: list[PrecioOut] = []


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
    costo: dict | None = None
    # 'vigente' | 'propuesta' | 'rechazada'. La propuesta no rige todavía.
    estado: str = "vigente"
    resuelta_por: str | None = None
    resuelta_at: datetime | None = None
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
    # Con el flujo de aprobación: hay un cambio esperando respuesta.
    modificado: bool = False
    # Plazo excepcional abierto por el admin; solo lo ve el panel.
    plazo_emergencia: datetime | None = None
    # Respuestas de la versión vigente; solo con ?incluir_datos=true.
    datos: dict | None = None
    # Costo congelado al guardar esa versión. None si el formulario no tiene
    # servicios tarifados, o si el ticket es anterior al costeo.
    costo: dict | None = None


class TicketDetalle(TicketResumen):
    datos: dict
    # El cambio esperando respuesta, si lo hay.
    propuesta: VersionOut | None = None
    versiones: list[VersionOut] = []
    eventos: list[EventoOut] = []


class ResolucionIn(BaseModel):
    aprobar: bool


class EmergenciaIn(BaseModel):
    hasta: datetime
    motivo: str = Field("", max_length=300)


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
    estado: Literal["activo", "inactivo", "rechazado"]
    # Va en el correo de rechazo; en los demás cambios se ignora.
    motivo: str | None = Field(None, max_length=500)


class ArchivoOut(BaseModel):
    id: str
    url: str
