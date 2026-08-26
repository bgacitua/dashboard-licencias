"""Endpoints del módulo Costos por Área (Fase 1 — MVP backend base)."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.core.security import require_module
from app.models.auth import Usuario
from app.repositories.costos_repo import CostosRepository
from app.services.costos_service import CostosService
from app.schemas.costos import (
    CompareRequest,
    PaisCostos,
    CompareResponse,
    DimensionesResponse,
    FilterRequest,
    JefaturasTopResponse,
    JefeSearchItem,
    JerarquiaResponse,
    KpiResponse,
    PersonaSearchItem,
    TendenciaResponse,
)

router = APIRouter()


def _service(db: Session, pais: str = "chile") -> CostosService:
    return CostosService(CostosRepository(db, pais))


# ---------------------------------------------------------------------------
# Catálogos / autocomplete
# ---------------------------------------------------------------------------
@router.get("/dimensiones", response_model=DimensionesResponse)
def get_dimensiones(
    pais: PaisCostos = Query(default="chile"),
    empresa: list[str] | None = Query(default=None),
    area: list[str] | None = Query(default=None),
    subarea: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    """Catálogos para selectores en cascada. Cache TTL 1h.

    Query repetidos: ?empresa=A&empresa=B&area=X
    """
    return _service(db, pais).get_dimensiones(empresa, area, subarea)


@router.get("/income-types", response_model=list[str])
def get_income_types(
    pais: PaisCostos = Query(default="chile"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    return _service(db, pais).get_income_types()


@router.get("/conceptos", response_model=list[str])
def get_conceptos(
    pais: PaisCostos = Query(default="chile"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    """Lista distinct de conceptos (hsi.name) para filtro fino: Sueldo Base, Hora Extra, etc."""
    return _service(db, pais).get_conceptos()


@router.get("/personas/buscar", response_model=list[PersonaSearchItem])
def buscar_personas(
    q: str = Query(min_length=2),
    pais: PaisCostos = Query(default="chile"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    return _service(db, pais).buscar_personas(q, limit)


@router.get("/jefes/buscar", response_model=list[JefeSearchItem])
def buscar_jefes(
    q: str = Query(min_length=2),
    pais: PaisCostos = Query(default="chile"),
    limit: int = Query(default=20, ge=1, le=100),
    empresa: list[str] | None = Query(default=None),
    area: list[str] | None = Query(default=None),
    subarea: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    return _service(db, pais).buscar_jefes(
        q, limit, empresas=empresa, areas=area, subareas=subarea
    )


# ---------------------------------------------------------------------------
# KPIs y series
# ---------------------------------------------------------------------------
@router.post("/kpis", response_model=KpiResponse)
def get_kpis(
    filtros: FilterRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    return _service(db, filtros.pais).get_kpis(filtros)


@router.post("/tendencia", response_model=TendenciaResponse)
def get_tendencia(
    filtros: FilterRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    return _service(db, filtros.pais).get_tendencia(filtros)


@router.post("/historico-contexto", response_model=TendenciaResponse)
def get_historico_contexto(
    filtros: FilterRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    return _service(db, filtros.pais).get_historico_contexto(filtros)


# ---------------------------------------------------------------------------
# Fase 3 (jerarquía y top) — endpoints listos, frontend consumirá luego.
# ---------------------------------------------------------------------------
@router.post("/jerarquia", response_model=JerarquiaResponse)
def get_jerarquia(
    filtros: FilterRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    return _service(db, filtros.pais).get_jerarquia(filtros)


@router.post("/jefaturas-top", response_model=JefaturasTopResponse)
def get_jefaturas_top(
    filtros: FilterRequest,
    limit: int = Query(default=10, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    return _service(db, filtros.pais).get_top_personas(filtros, limit)


# ---------------------------------------------------------------------------
# Comparación (slots A/B/C/D)
# ---------------------------------------------------------------------------
@router.post("/comparar", response_model=CompareResponse)
def comparar(
    body: CompareRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("costos")),
):
    return _service(db, body.pais).comparar(
        body.fecha_inicio,
        body.fecha_fin,
        body.slots,
        income_types=body.income_types,
        conceptos=body.conceptos,
    )


# ---------------------------------------------------------------------------
# Stub Fase 4 — proyección teórica vía calculadora.
# ---------------------------------------------------------------------------
@router.post("/proyeccion-teorica")
def proyeccion_teorica(
    _: Usuario = Depends(require_module("costos")),
):
    # TODO: integrar con módulo calculadora cuando se aborde la Fase 4.
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Proyección teórica aún no implementada (Fase 4).",
    )
