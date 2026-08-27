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
    datos: dict
    n8n_ok: bool | None = None
    created_at: datetime
