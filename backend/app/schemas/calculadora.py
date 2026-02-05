"""
Schemas Pydantic para la calculadora de sueldos.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class BonoInput(BaseModel):
    """Representa un bono individual"""
    nombre: str
    monto: int = Field(gt=0)
    imponible: bool = True

class CalculoRequest(BaseModel):
    """Request para calcular sueldo base desde líquido deseado"""
    sueldo_liquido: int = Field(gt=0, description="Sueldo líquido objetivo")
    movilizacion: int = Field(default=40000, ge=0)
    afp_nombre: str = Field(default="Uno")
    salud_sistema: Literal["fonasa", "isapre"] = "fonasa"
    salud_uf: float = Field(default=0.0, ge=0, description="Plan isapre en UF (solo si es isapre)")
    bonos: List[BonoInput] = []

class CalculoResponse(BaseModel):
    """Respuesta con el desglose completo del cálculo"""
    # Resultado principal
    sueldo_base: int
    sueldo_liquido: int
    
    # Haberes
    gratificacion: int
    bonos_imponibles: int
    bonos_no_imponibles: int
    movilizacion: int
    imponible: int
    total_haberes: int
    
    # Descuentos
    cotizacion_previsional: int
    cotizacion_salud: int
    cesantia: int
    impuesto: int
    total_descuentos: int
    
    # Metadata
    diferencia: int = Field(description="Diferencia vs objetivo por redondeo")
    redondeo_aplicado: int

class SimulacionRequest(BaseModel):
    """Request para simular líquido desde sueldo base"""
    sueldo_base: int = Field(gt=0)
    movilizacion: int = Field(default=40000, ge=0)
    afp_nombre: str = Field(default="Uno")
    salud_sistema: Literal["fonasa", "isapre"] = "fonasa"
    salud_uf: float = Field(default=0.0, ge=0)
    bonos: List[BonoInput] = []

class SimulacionResponse(BaseModel):
    """Respuesta de simulación forward"""
    sueldo_base: int
    sueldo_liquido: int
    total_haberes: int
    total_descuentos: int
    detalle: dict

class ParametrosResponse(BaseModel):
    """Parámetros actuales del sistema"""
    valor_uf: float
    sueldo_minimo: int
    tope_imponible_afp_salud_uf: float
    tope_imponible_cesantia_uf: float
    default_plan_isapre_uf: float
    afps: dict
    tramos_impuesto: list