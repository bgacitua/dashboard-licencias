"""Router de administración del módulo de formularios.

Contrato con la plataforma — este módulo importa de fuera de su carpeta:

    app.core.security.require_module        -> autorización
    app.core.security.get_current_active_user -> autoría del formulario
    app.core.rate_limit                     -> gate público
    app.db.deps.get_db                      -> sesión PostgreSQL
    app.core.logging_config.logger          -> logs
    app.core.config.settings                -> bundle CA del cert de n8n

Cualquier import adicional hacia `app.*` es acoplamiento: revisarlo antes de
agregarlo.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import get_current_active_user, require_module
from app.db.deps import get_db

from .config import FormulariosSettings, get_settings
from .models import Formulario, FormRespuesta
from .schemas import FormularioCreate, FormularioOut, FormularioUpdate, RespuestaOut

router = APIRouter(dependencies=[Depends(require_module("formularios"))])

Db = Annotated[Session, Depends(get_db)]
Cfg = Annotated[FormulariosSettings, Depends(get_settings)]


def _validar_webhook(cfg: FormulariosSettings, url: str | None) -> None:
    """La URL la escribe un admin y el backend la llama después: sin allowlist
    de host sería un SSRF desde el panel."""
    if url and not cfg.webhook_permitido(url):
        raise HTTPException(
            400,
            "El webhook debe ser https y apuntar a un host autorizado "
            "(FORMULARIOS_N8N_HOSTS).",
        )


@router.get("/", response_model=list[FormularioOut])
def listar(db: Db) -> list[Formulario]:
    return db.query(Formulario).order_by(Formulario.updated_at.desc()).all()


@router.post("/", response_model=FormularioOut, status_code=201)
def crear(datos: FormularioCreate, db: Db, cfg: Cfg, usuario=Depends(get_current_active_user)) -> Formulario:
    _validar_webhook(cfg, datos.n8n_webhook_url)
    formulario = Formulario(**datos.model_dump(), creado_por=usuario.username)
    db.add(formulario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"Ya existe un formulario con el slug '{datos.slug}'.")
    db.refresh(formulario)
    return formulario


@router.get("/{formulario_id}", response_model=FormularioOut)
def obtener(formulario_id: int, db: Db) -> Formulario:
    formulario = db.get(Formulario, formulario_id)
    if not formulario:
        raise HTTPException(404, "Formulario no encontrado.")
    return formulario


@router.put("/{formulario_id}", response_model=FormularioOut)
def actualizar(formulario_id: int, datos: FormularioUpdate, db: Db, cfg: Cfg) -> Formulario:
    formulario = db.get(Formulario, formulario_id)
    if not formulario:
        raise HTTPException(404, "Formulario no encontrado.")
    cambios = datos.model_dump(exclude_unset=True)
    if "n8n_webhook_url" in cambios:
        _validar_webhook(cfg, cambios["n8n_webhook_url"])
    for campo, valor in cambios.items():
        setattr(formulario, campo, valor)
    db.commit()
    db.refresh(formulario)
    return formulario


@router.delete("/{formulario_id}", status_code=204)
def eliminar(formulario_id: int, db: Db) -> None:
    formulario = db.get(Formulario, formulario_id)
    if not formulario:
        raise HTTPException(404, "Formulario no encontrado.")
    db.delete(formulario)
    db.commit()


@router.get("/{formulario_id}/respuestas", response_model=list[RespuestaOut])
def respuestas(formulario_id: int, db: Db, limit: int = 200) -> list[FormRespuesta]:
    limit = max(1, min(1000, limit))
    return (
        db.query(FormRespuesta)
        .filter(FormRespuesta.formulario_id == formulario_id)
        .order_by(FormRespuesta.created_at.desc())
        .limit(limit)
        .all()
    )
