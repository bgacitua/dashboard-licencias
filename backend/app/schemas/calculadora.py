from typing import Literal, Optional, Union
from pydantic import BaseModel, Field

Pais = Literal["chile", "peru", "brasil"]


class TramoImpuesto(BaseModel):
    desde: float
    hasta: Optional[float] = None
    factor: float
    rebaja: float


class Tasas(BaseModel):
    TASA_SALUD_FONASA: float
    TASA_CESANTIA: float
    TOPE_AFP_SALUD_UF: float
    TOPE_CESANTIA_UF: float
    GRATIFICACION_MAX_IMM: float
    SUELDO_MINIMO: float
    CESANTIA_EMPLEADOR: float
    MUTUAL: float
    SIS: float
    EXPECTATIVA_VIDA: float
    AFP_EMPLEADOR: float
    SEGURO_COMPLEMENTARIO_UF: float


class BonoAnualesUF(BaseModel):
    navidad: float
    escolaridad: float
    fiestaPatrias: float


class BonoEmpresaTipo(BaseModel):
    tipo: str
    nombre: str
    tasa: Optional[Union[float, list[float]]] = None
    imponible: bool


class CountryConfigOut(BaseModel):
    """Shape consumido por el frontend (mismo contrato que tenía Supabase)."""
    afpData: dict[str, float] = Field(default_factory=dict)
    ufValue: float
    dolarValue: float
    taxBrackets: list[TramoImpuesto] = Field(default_factory=list)
    bonosAnualesUF: BonoAnualesUF
    bonosEmpresa: list[BonoEmpresaTipo] = Field(default_factory=list)
    tasas: Tasas
