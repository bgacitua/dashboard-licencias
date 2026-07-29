from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, Any, Dict


class DesvinculacionUpsert(BaseModel):
    """Guardado del formulario de desvinculación. Todo opcional: el usuario puede
    guardar un borrador incompleto."""
    causal: Optional[str] = None
    fecha_termino: Optional[date] = None
    payload_json: Optional[Dict[str, Any]] = None
    # Total congelado al generar la carta. Omitirlo conserva el valor anterior.
    total_finiquito: Optional[float] = None


class DesvinculacionHito(BaseModel):
    """Hito alcanzado. Ver HITOS en el servicio para los valores aceptados."""
    hito: str


class DesvinculacionResponse(BaseModel):
    rut: str
    causal: Optional[str] = None
    fecha_termino: Optional[date] = None
    payload_json: Optional[Dict[str, Any]] = None
    total_finiquito: Optional[float] = None
    carta_generada_at: Optional[datetime] = None
    finiquito_generado_at: Optional[datetime] = None
    correo_enviado_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    estado: str

    class Config:
        from_attributes = True
