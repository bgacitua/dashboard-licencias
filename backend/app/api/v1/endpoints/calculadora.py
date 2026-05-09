"""
Endpoints de la calculadora de sueldos multi-país.
Reemplaza la calculadora Chile-only previa.
"""
from typing import Literal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.core.security import require_module
from app.models.auth import Usuario
from app.repositories.calculadora_repo import CalculadoraRepository
from app.services.calculadora_service import CalculadoraService


router = APIRouter()

Pais = Literal["chile", "peru", "brasil"]


@router.get("/config/{pais}")
def get_country_config(
    pais: Pais,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("calculadora")),
):
    """Configuración del país (UF, dólar, AFP, tasas, tax_brackets, bonos).

    Lee de calculadora.country_config (poblada por n8n).
    Cache TTL 1h en memoria por país.
    """
    repo = CalculadoraRepository(db)
    service = CalculadoraService(repo)
    return service.get_country_config(pais)
