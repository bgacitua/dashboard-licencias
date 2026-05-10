"""Pydantic schemas del módulo Costos por Área."""
from datetime import date
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Filtros (body común para los endpoints POST)
# ---------------------------------------------------------------------------
class FilterRequest(BaseModel):
    fecha_inicio: date                         # primer día del mes
    fecha_fin: date                            # último día del mes
    empresas: Optional[list[str]] = None
    areas: Optional[list[str]] = None
    subareas: Optional[list[str]] = None
    centros_costo: Optional[list[str]] = None
    jefatura_rut: Optional[str] = None         # cadena descendente vía MV recursiva
    cargo: Optional[str] = None
    persona_rut: Optional[str] = None
    income_types: Optional[list[str]] = None   # None o vacío = todos
    conceptos: Optional[list[str]] = None      # filtro fino por hsi.name (Sueldo Base, Hora Extra, …)


# ---------------------------------------------------------------------------
# Catálogos / autocomplete
# ---------------------------------------------------------------------------
class DimensionesResponse(BaseModel):
    empresas: list[str]
    areas: list[str]
    subareas: list[str]
    centros_costo: list[str]
    cargos: list[str]


class PersonaSearchItem(BaseModel):
    rut: str
    full_name: str
    cargo: Optional[str] = None
    empresa: Optional[str] = None
    area: Optional[str] = None


class JefeSearchItem(BaseModel):
    rut: str
    full_name: str
    name_role: Optional[str] = None
    empresa: Optional[str] = None
    area: Optional[str] = None
    subordinados_directos: int


# ---------------------------------------------------------------------------
# KPIs principales
# ---------------------------------------------------------------------------
class ConceptoBreakdown(BaseModel):
    concepto: Optional[str] = None
    monto: float


class CostoConProyeccion(BaseModel):
    valor_real: float
    valor_teorico: Optional[float] = None
    es_proyeccion: bool = False
    meses_reales: Optional[int] = None
    desglose_concepto: list[ConceptoBreakdown] = Field(default_factory=list)
    etiqueta: Optional[str] = None             # ej: "abr-26" o "últimos 12 meses"


class VariacionResponse(BaseModel):
    valor_pct: Optional[float] = None
    mes_referencia: Optional[str] = None
    mes_comparacion: Optional[str] = None


class KpiResponse(BaseModel):
    costo_total_periodo: float
    costo_mensual: CostoConProyeccion
    costo_anual: CostoConProyeccion
    headcount_cierre: int
    headcount_delta_mom: int
    costo_promedio_persona: float
    mom: VariacionResponse
    yoy: VariacionResponse
    banner: Optional[str] = None
    ultimo_mes_cerrado: Optional[date] = None


# ---------------------------------------------------------------------------
# Series temporales
# ---------------------------------------------------------------------------
class TendenciaPunto(BaseModel):
    pay_period: date
    costo: float
    headcount: int


class TendenciaResponse(BaseModel):
    serie: list[TendenciaPunto]


# ---------------------------------------------------------------------------
# Jerarquía / treemap (Fase 3)
# ---------------------------------------------------------------------------
class JerarquiaNodo(BaseModel):
    empresa: Optional[str] = None
    area: Optional[str] = None
    centro_costo: Optional[str] = None
    costo: float
    headcount: int


class JerarquiaResponse(BaseModel):
    nodos: list[JerarquiaNodo]


# ---------------------------------------------------------------------------
# Top jefaturas (Fase 3)
# ---------------------------------------------------------------------------
class JefaturaTopItem(BaseModel):
    rank: int
    rut: Optional[str] = None
    full_name: Optional[str] = None
    cargo: Optional[str] = None
    jefatura_nombre: Optional[str] = None
    jefatura_rut: Optional[str] = None
    costo: float
    concepto_principal: Optional[str] = None


class JefaturasTopResponse(BaseModel):
    items: list[JefaturaTopItem]


# ---------------------------------------------------------------------------
# Comparación (slots A/B/C/D)
# ---------------------------------------------------------------------------
class SlotInput(BaseModel):
    id: Literal["A", "B", "C", "D"]
    tipo: Literal["area", "jefatura", "cargo", "persona"]
    valor: dict          # shape varía por tipo, validado en el service
    label: Optional[str] = None


class CompareRequest(BaseModel):
    fecha_inicio: date
    fecha_fin: date
    income_types: Optional[list[str]] = None
    conceptos: Optional[list[str]] = None
    slots: list[SlotInput] = Field(default_factory=list, max_length=4)


class CompareSlotResult(BaseModel):
    slot_id: str
    tipo: str
    label: str
    kpis: dict           # mantenemos dict para evitar duplicación con KpiResponse
    serie: list[TendenciaPunto]


class CompareResponse(BaseModel):
    slots: list[CompareSlotResult]
