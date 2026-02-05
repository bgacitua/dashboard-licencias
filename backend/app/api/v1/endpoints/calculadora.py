"""
Endpoints de la calculadora de sueldos.
"""
from fastapi import APIRouter
from typing import List

from app.services.calculadora_service import CalculadoraService
from app.schemas.calculadora import (
    CalculoRequest, CalculoResponse,
    SimulacionRequest, SimulacionResponse,
    ParametrosResponse
)
from app.core.calculadora_data import (
    VALOR_UF_ACTUAL, SUELDO_MINIMO, TASAS_AFP,
    TOPE_IMPONIBLE_AFP_SALUD, TOPE_IMPONIBLE_CESANTIA,
    DEFAULT_PLAN_ISAPRE_UF, TRAMOS_IMPUESTO
)

router = APIRouter()
service = CalculadoraService()


@router.get("/parametros", response_model=ParametrosResponse)
def obtener_parametros():
    """Obtiene los parámetros actuales del sistema (UF, AFPs, tramos, etc.)"""
    return ParametrosResponse(
        valor_uf=VALOR_UF_ACTUAL,
        sueldo_minimo=SUELDO_MINIMO,
        tope_imponible_afp_salud_uf=TOPE_IMPONIBLE_AFP_SALUD,
        tope_imponible_cesantia_uf=TOPE_IMPONIBLE_CESANTIA,
        default_plan_isapre_uf=DEFAULT_PLAN_ISAPRE_UF,
        afps=TASAS_AFP,
        tramos_impuesto=TRAMOS_IMPUESTO
    )


@router.get("/afps", response_model=List[str])
def listar_afps():
    """Lista las AFPs disponibles ordenadas alfabéticamente"""
    return sorted(list(TASAS_AFP.keys()))


@router.post("/calcular", response_model=CalculoResponse)
def calcular_sueldo_base(request: CalculoRequest):
    """
    Calcula el sueldo base necesario para obtener el líquido deseado.
    
    Usa búsqueda binaria y redondea el resultado a miles hacia arriba.
    """
    return service.resolver_sueldo_base(request)


@router.post("/simular", response_model=SimulacionResponse)
def simular_liquido(request: SimulacionRequest):
    """
    Simula el sueldo líquido dado un sueldo base.
    
    Útil para verificar cálculos o hacer simulaciones "forward".
    """
    datos = {
        "movilizacion": request.movilizacion,
        "afp_nombre": request.afp_nombre,
        "salud_sistema": request.salud_sistema,
        "salud_uf": request.salud_uf,
        "bonos": [b.model_dump() for b in request.bonos]
    }
    
    liquido, detalles = service.simular_liquido(request.sueldo_base, datos)
    
    return SimulacionResponse(
        sueldo_base=request.sueldo_base,
        sueldo_liquido=round(liquido),
        total_haberes=round(detalles['hab']),
        total_descuentos=round(detalles['desc']),
        detalle=detalles
    )