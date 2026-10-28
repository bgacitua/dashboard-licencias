"""Router del módulo de compensaciones.

Contrato con la plataforma — este módulo importa de fuera de su carpeta:

    app.core.security.require_module          -> autorización
    app.core.security.get_current_active_user -> autoría del análisis
    app.db.deps.get_db                        -> sesión PostgreSQL
    app.core.logging_config.logger            -> logs

Cualquier import adicional hacia `app.*` es acoplamiento: revisarlo antes de
agregarlo.
"""
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_active_user, require_module
from app.db.deps import get_db

from . import repository as repo
from . import service
from .schemas import Analisis, AnalisisIn, CargoEmpresaOut, Estudio, MatchIn, MatchOut, Nivel, ResultadoIn, ResultadoOut

router = APIRouter(dependencies=[Depends(require_module("compensaciones"))])

Db = Annotated[Session, Depends(get_db)]


@router.get("/estudios", response_model=list[Estudio])
def estudios(db: Db):
    return repo.estudios(db)


@router.post("/match", response_model=MatchOut)
def match(body: MatchIn, db: Db):
    return service.match(db, body.estudio_id, body.cargo_nombre, body.descriptor)


@router.get("/niveles", response_model=list[Nivel])
def niveles(db: Db, estudio_id: int, cargos: Annotated[list[str], Query(min_length=1)]):
    return repo.niveles(db, estudio_id, cargos)


@router.post("/resultado", response_model=ResultadoOut)
def resultado(body: ResultadoIn, db: Db):
    return service.resultado(db, body.estudio_id, body.cargos, body.nivel)


@router.get("/cargos-empresa", response_model=list[CargoEmpresaOut])
def cargos_empresa(estudio_id: int, db: Db):
    return service.cargos_empresa(db, estudio_id)


@router.post("/analisis")
def guardar(body: AnalisisIn, db: Db, usuario=Depends(get_current_active_user)):
    """Con `cargo_empresa_id` es una homologación: solo `admin`, y el cargo debe ser del país del estudio."""
    if body.cargo_empresa_id is not None:
        if _dueno(usuario) is not None:
            raise HTTPException(403, "Solo un administrador puede homologar cargos de la empresa")
        if not repo.cargo_del_pais_del_estudio(db, body.cargo_empresa_id, body.estudio_id):
            raise HTTPException(400, "El cargo de la empresa no corresponde al país del estudio")
    a = body.model_dump(exclude={"candidatos"})
    a["candidatos"] = json.dumps([c.model_dump() for c in body.candidatos])
    return {"id": repo.guardar_analisis(db, a, usuario.username)}


@router.get("/analisis", response_model=list[Analisis])
def historial(estudio_id: int, db: Db, usuario=Depends(get_current_active_user)):
    """El rol `admin` ve los análisis de todos; el resto, solo los suyos."""
    return repo.historial(db, estudio_id, _dueno(usuario))


@router.delete("/analisis/{analisis_id}", status_code=204)
def borrar(analisis_id: int, db: Db, usuario=Depends(get_current_active_user)):
    """Misma regla que el historial: `admin` borra cualquiera; el resto, solo los suyos."""
    if not repo.borrar_analisis(db, analisis_id, _dueno(usuario)):
        raise HTTPException(404, "Análisis no encontrado")


def _dueno(usuario) -> str | None:
    """None para `admin` (sin filtro); si no, el username."""
    return None if usuario.rol is not None and usuario.rol.nombre == "admin" else usuario.username
