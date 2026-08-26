from typing import Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field

Pais = Literal["chile", "peru", "brasil"]


class TramoImpuesto(BaseModel):
    desde: float
    hasta: Optional[float] = None
    factor: float
    rebaja: float


class Tasas(BaseModel):
    """Tasas de country_config.

    Cada país trae su propio juego de claves (Chile: UF/cesantía; Perú: UIT/
    EsSalud; Brasil: INSS/RAT/FGTS/IRRF), así que ninguna es obligatoria y las
    claves no listadas se conservan tal cual.
    """
    model_config = ConfigDict(extra="allow")

    # Chile
    TASA_SALUD_FONASA: Optional[float] = None
    TASA_CESANTIA: Optional[float] = None
    TOPE_AFP_SALUD_UF: Optional[float] = None
    TOPE_CESANTIA_UF: Optional[float] = None
    GRATIFICACION_MAX_IMM: Optional[float] = None
    SUELDO_MINIMO: Optional[float] = None
    CESANTIA_EMPLEADOR: Optional[float] = None
    MUTUAL: Optional[float] = None
    SIS: Optional[float] = None
    EXPECTATIVA_VIDA: Optional[float] = None
    AFP_EMPLEADOR: Optional[float] = None
    SEGURO_COMPLEMENTARIO_UF: Optional[float] = None

    # Perú — catálogo de aportes patronales (validado en el servicio)
    APORTES_PATRONALES: Optional[list[dict]] = None

    # Brasil — costo empresa (modelo del Excel)
    INSS_PATRONAL: Optional[float] = None
    RAT: Optional[float] = None
    RAT_FAP: Optional[float] = None
    TERCEIROS: Optional[float] = None
    FGTS: Optional[float] = None
    MESES_ANIO: Optional[float] = None
    PROVISION_13_DIVISOR: Optional[float] = None
    PROVISION_VACACIONES_DIVISOR: Optional[float] = None
    ADICIONAL_VACACIONES_DIVISOR: Optional[float] = None

    # Brasil — liquidación del trabajador
    SALARIO_MINIMO: Optional[float] = None
    INSS_TRABAJADOR_TRAMOS: Optional[list[dict]] = None
    INSS_TRABAJADOR_TOPE: Optional[float] = None
    IRRF_DESCUENTO_SIMPLIFICADO: Optional[float] = None
    IRRF_TRAMOS: Optional[list[dict]] = None
    IRRF_REDUCCION_LIMITE_TOTAL: Optional[float] = None
    IRRF_REDUCCION_LIMITE_PARCIAL: Optional[float] = None
    IRRF_REDUCCION_MAXIMA: Optional[float] = None
    IRRF_REDUCCION_CONSTANTE: Optional[float] = None
    IRRF_REDUCCION_FACTOR: Optional[float] = None


class BonoAnualesUF(BaseModel):
    navidad: float
    escolaridad: float
    fiestaPatrias: float


class BonoEmpresaTipo(BaseModel):
    """El frontend selecciona por `id`; `tipo` se conserva como espejo para
    las filas antiguas que sólo traían esa clave."""
    model_config = ConfigDict(extra="allow")

    id: str
    tipo: Optional[str] = None
    nombre: str
    tasa: Optional[Union[float, list[float]]] = None
    montoFijo: Optional[float] = None
    periodicidad: Optional[str] = None
    imponible: bool = False


class CountryConfigOut(BaseModel):
    """Shape consumido por el frontend (mismo contrato que tenía Supabase)."""
    afpData: dict[str, float] = Field(default_factory=dict)
    ufValue: float
    dolarValue: float
    taxBrackets: list[TramoImpuesto] = Field(default_factory=list)
    bonosAnualesUF: Optional[BonoAnualesUF] = None
    bonosEmpresa: list[BonoEmpresaTipo] = Field(default_factory=list)
    tasas: Tasas = Field(default_factory=Tasas)


class ProyeccionUtilidadesPeruIn(BaseModel):
    """Entrada del reparto de utilidades estimado (Perú).

    `sueldo_base_calculado` es el sueldo base que ya devolvió la calculadora,
    en cualquiera de los dos modos (Base → Líquido / Líquido → Base).
    """
    sueldo_base_calculado: float = Field(ge=0)
    renta_imponible_proyectada: float = Field(ge=0)
    porcentaje_utilidades: float = Field(ge=0, le=1)
    tiene_asignacion_familiar: bool = False
