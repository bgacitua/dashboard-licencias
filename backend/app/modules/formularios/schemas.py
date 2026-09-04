from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FormularioBase(BaseModel):
    slug: str = Field(..., min_length=1, max_length=80, pattern=r"^[a-z0-9][a-z0-9-]*$")
    titulo: str = Field(..., min_length=1, max_length=200)
    definicion: dict = Field(default_factory=lambda: {"pages": []})
    n8n_webhook_url: str | None = None
    activo: bool = True


class FormularioCreate(FormularioBase):
    pass


class FormularioUpdate(BaseModel):
    titulo: str | None = Field(None, min_length=1, max_length=200)
    definicion: dict | None = None
    n8n_webhook_url: str | None = None
    activo: bool | None = None


class FormularioOut(FormularioBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    creado_por: str | None = None
    created_at: datetime
    updated_at: datetime
    # Lo llena el listado; en las respuestas de un solo formulario va en 0.
    respuestas: int = 0


class GateRequest(BaseModel):
    slug: str = Field(..., max_length=80)
    rut: str = Field(..., max_length=20)


class GateResponse(BaseModel):
    ok: bool
    # Solo viene con ok=true. Con ok=false el mensaje es genérico a propósito.
    redirect: str | None = None
    mensaje: str | None = None


class FormularioPublicoOut(BaseModel):
    titulo: str
    definicion: dict
    # Respuesta previa, si ya respondió con este enlace. version 0 = sin responder.
    datos: dict | None = None
    version: int = 0


class SubmitRequest(BaseModel):
    token: str = Field(..., max_length=64)
    datos: dict


class SubmitResponse(BaseModel):
    ok: bool
    respuesta_id: int


class RespuestaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    formulario_id: int
    rut: str | None = None
    nombre: str | None = None
    datos: dict
    n8n_ok: bool | None = None
    version: int = 1
    # Agrupa las versiones de un mismo envío sin exponer el token.
    envio: str | None = None
    created_at: datetime
    fecha_envio: datetime | None = None
    fecha_respuesta: datetime | None = None


class PersonaOut(BaseModel):
    """Lo mínimo para elegir a quién enviarle. El correo se muestra para poder
    confirmar el destino antes de mandar; el envío no lo recibe de vuelta."""

    rut: str
    nombre: str | None = None
    email: str | None = None


class EnvioRequest(BaseModel):
    # Solo el RUT: el correo lo resuelve el backend contra la nómina.
    rut: str = Field(..., max_length=20)


class EnvioResponse(BaseModel):
    ok: bool
    mensaje: str
    email: str | None = None
