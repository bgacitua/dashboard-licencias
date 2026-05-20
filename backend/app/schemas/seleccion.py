from pydantic import BaseModel, EmailStr
from datetime import date
from typing import Optional
from decimal import Decimal


class CandidatoBase(BaseModel):
    empresa: str
    fecha_cierre: Optional[date] = None
    rut: Optional[str] = None
    nombre: str
    cargo: str
    lugar_de_trabajo: Optional[str] = None
    jornada_de_trabajo: Optional[str] = None
    tipo_de_contrato: Optional[str] = None
    fecha_de_inicio: Optional[date] = None
    gerencia: Optional[str] = None
    sueldo_base: Optional[Decimal] = None
    bono: Optional[Decimal] = None
    movilizacion: Optional[Decimal] = None
    correo_analista: Optional[str] = None
    status: Optional[str] = "Pendiente"


class CandidatoCreate(CandidatoBase):
    pass


class CandidatoUpdate(BaseModel):
    empresa: Optional[str] = None
    fecha_cierre: Optional[date] = None
    rut: Optional[str] = None
    nombre: Optional[str] = None
    cargo: Optional[str] = None
    lugar_de_trabajo: Optional[str] = None
    jornada_de_trabajo: Optional[str] = None
    tipo_de_contrato: Optional[str] = None
    fecha_de_inicio: Optional[date] = None
    gerencia: Optional[str] = None
    sueldo_base: Optional[Decimal] = None
    bono: Optional[Decimal] = None
    movilizacion: Optional[Decimal] = None
    correo_analista: Optional[str] = None
    status: Optional[str] = None


class CandidatoResponse(CandidatoBase):
    id: int

    class Config:
        from_attributes = True
