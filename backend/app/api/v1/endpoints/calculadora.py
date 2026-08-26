"""
Endpoints de la calculadora de sueldos multi-país.
Reemplaza la calculadora Chile-only previa.
"""
from typing import Literal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.core.security import require_module, require_role
from app.models.auth import Usuario
from app.repositories.calculadora_repo import CalculadoraRepository
from app.schemas.calculadora import ProyeccionUtilidadesPeruIn
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


@router.post("/peru/utilidades/proyeccion")
def proyeccion_utilidades_peru(
    payload: ProyeccionUtilidadesPeruIn,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_module("calculadora")),
):
    """Asignación familiar y canasta navideña anuales (Perú).

    El reparto de utilidades está EN PAUSA: se devuelve en 0.

    Anual, sobre la nómina activa y los días trabajados del año en curso.
    Los factores salen de calculadora.country_config.tasas; el único valor
    editable por el usuario es porcentaje_utilidades.
    """
    repo = CalculadoraRepository(db)
    service = CalculadoraService(repo)
    return service.proyeccion_utilidades_peru(payload)


@router.post("/config/{pais}/refresh")
def refresh_country_config(
    pais: Pais,
    db: Session = Depends(get_db),
    _: Usuario = Depends(require_role(["admin"])),
):
    """Invalida la caché de configuración de un país y la relee de la BD.

    Pensado para usarse justo después de actualizar las tasas: sin esto los
    cambios tardan hasta una hora en verse. Restringido a admin, igual que el
    resto de las acciones administrativas.
    """
    CalculadoraService.invalidate_cache(pais)
    repo = CalculadoraRepository(db)
    service = CalculadoraService(repo)
    config = service.get_country_config(pais)
    return {
        "pais": pais,
        "refrescado": True,
        "updated_at": config["_meta"]["updated_at"],
        "warnings": config["_meta"]["warnings"],
        "configErrors": config["_meta"].get("configErrors", []),
    }
