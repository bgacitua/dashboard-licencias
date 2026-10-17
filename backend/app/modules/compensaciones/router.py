"""Router del módulo de compensaciones.

Contrato con la plataforma — este módulo importa de fuera de su carpeta:

    app.core.security.require_module          -> autorización
    app.core.security.get_current_active_user -> autoría del análisis
    app.db.deps.get_db                        -> sesión PostgreSQL
    app.core.logging_config.logger            -> logs

Cualquier import adicional hacia `app.*` es acoplamiento: revisarlo antes de
agregarlo.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_active_user, require_module
from app.db.deps import get_db

from . import repository as repo
from . import service
from .schemas import Estudio, MatchIn, MatchOut, Nivel, ResultadoIn, ResultadoOut

router = APIRouter(dependencies=[Depends(require_module("compensaciones"))])

Db = Annotated[Session, Depends(get_db)]


@router.get("/estudios", response_model=list[Estudio])
def estudios(db: Db):
    return repo.estudios(db)


@router.post("/match", response_model=MatchOut)
def match(body: MatchIn, db: Db, usuario=Depends(get_current_active_user)):
    return service.match(db, body.estudio_id, body.cargo_nombre, body.descriptor, usuario.username)


@router.get("/niveles", response_model=list[Nivel])
def niveles(db: Db, estudio_id: int, cargos: Annotated[list[str], Query(min_length=1)]):
    return repo.niveles(db, estudio_id, cargos)


@router.post("/analisis/{analisis_id}/resultado", response_model=ResultadoOut)
def resultado(analisis_id: int, body: ResultadoIn, db: Db):
    return service.resultado(db, analisis_id, body.cargos, body.nivel)
