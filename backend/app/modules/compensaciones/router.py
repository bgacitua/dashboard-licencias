"""Router del módulo de compensaciones.

Contrato con la plataforma — este módulo importa de fuera de su carpeta:

    app.core.security.require_module          -> autorización
    app.core.security.get_current_active_user -> autoría y acceso
    app.db.deps.get_db                        -> sesión PostgreSQL
    app.core.logging_config.logger            -> logs

Cualquier import adicional hacia `app.*` es acoplamiento: revisarlo antes de
agregarlo.
"""
import json
from typing import Annotated, NamedTuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_active_user, require_module
from app.db.deps import get_db

from . import repository as repo
from . import service
from .schemas import Analisis, AnalisisIn, CargoEmpresaOut, Estudio, MatchIn, MatchOut, Nivel, ResultadoIn, ResultadoOut

router = APIRouter(dependencies=[Depends(require_module("compensaciones"))])

Db = Annotated[Session, Depends(get_db)]


class Acceso(NamedTuple):
    username: str
    admin: bool
    paises: list[str] | None  # None = todos (admin)


def _acceso(db: Db, usuario=Depends(get_current_active_user)) -> Acceso:
    """Según compensaciones.acceso: admin ve todos los países; el resto, sus `paises`; sin fila, ninguno."""
    r = repo.acceso(db, usuario.username)
    if r and r["admin"]:
        return Acceso(usuario.username, True, None)
    return Acceso(usuario.username, False, list(r["paises"]) if r else [])


Acc = Annotated[Acceso, Depends(_acceso)]


def _permitir(db: Session, acc: Acceso, estudio_id: int) -> None:
    """404 si el estudio es de un país sin acceso (no se revela que existe)."""
    if acc.paises is not None:
        e = repo.get_estudio(db, estudio_id)
        if not e or e["pais"] not in acc.paises:
            raise HTTPException(404, "Estudio no encontrado")


@router.get("/permisos")
def permisos(acc: Acc):
    return {"admin": acc.admin}


@router.get("/estudios", response_model=list[Estudio])
def estudios(db: Db, acc: Acc):
    return repo.estudios(db, acc.paises)


@router.post("/match", response_model=MatchOut)
def match(body: MatchIn, db: Db, acc: Acc):
    _permitir(db, acc, body.estudio_id)
    return service.match(db, body.estudio_id, body.cargo_nombre, body.descriptor)


@router.get("/niveles", response_model=list[Nivel])
def niveles(db: Db, acc: Acc, estudio_id: int, cargos: Annotated[list[str], Query(min_length=1)]):
    _permitir(db, acc, estudio_id)
    return repo.niveles(db, estudio_id, cargos)


@router.post("/resultado", response_model=ResultadoOut)
def resultado(body: ResultadoIn, db: Db, acc: Acc):
    _permitir(db, acc, body.estudio_id)
    return service.resultado(db, body.estudio_id, body.cargos, body.nivel)


@router.get("/cargos-empresa", response_model=list[CargoEmpresaOut])
def cargos_empresa(estudio_id: int, db: Db, acc: Acc):
    _permitir(db, acc, estudio_id)
    return service.cargos_empresa(db, estudio_id)


@router.post("/analisis")
def guardar(body: AnalisisIn, db: Db, acc: Acc):
    """Con `cargo_empresa_id` es una homologación: solo admin, y el cargo debe ser del país del estudio."""
    _permitir(db, acc, body.estudio_id)
    if body.cargo_empresa_id is not None:
        if not acc.admin:
            raise HTTPException(403, "Solo un administrador puede homologar cargos de la empresa")
        if not repo.cargo_del_pais_del_estudio(db, body.cargo_empresa_id, body.estudio_id):
            raise HTTPException(400, "El cargo de la empresa no corresponde al país del estudio")
    a = body.model_dump(exclude={"candidatos"})
    a["candidatos"] = json.dumps([c.model_dump() for c in body.candidatos])
    return {"id": repo.guardar_analisis(db, a, acc.username)}


@router.get("/analisis", response_model=list[Analisis])
def historial(estudio_id: int, db: Db, acc: Acc):
    """El admin ve los análisis de todos; el resto, solo los suyos."""
    _permitir(db, acc, estudio_id)
    return repo.historial(db, estudio_id, _dueno(acc))


@router.delete("/analisis/{analisis_id}", status_code=204)
def borrar(analisis_id: int, db: Db, acc: Acc):
    """Misma regla que el historial: el admin borra cualquiera; el resto, solo los suyos."""
    if not repo.borrar_analisis(db, analisis_id, _dueno(acc)):
        raise HTTPException(404, "Análisis no encontrado")


def _dueno(acc: Acceso) -> str | None:
    """None para el admin (sin filtro); si no, el username."""
    return None if acc.admin else acc.username
