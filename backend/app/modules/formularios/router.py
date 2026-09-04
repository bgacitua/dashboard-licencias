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
from . import repository as repo
from .models import Formulario
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
def listar(db: Db) -> list[FormularioOut]:
    """Listado del gestor. Trae el conteo de respuestas para no pedirlo por fila."""
    formularios = db.query(Formulario).order_by(Formulario.updated_at.desc()).all()
    conteo = repo.conteo_respuestas(db)
    return [
        FormularioOut.model_validate(f).model_copy(update={"respuestas": conteo.get(f.id, 0)})
        for f in formularios
    ]


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


@router.post("/{formulario_id}/duplicar", response_model=FormularioOut, status_code=201)
def duplicar(formulario_id: int, db: Db, usuario=Depends(get_current_active_user)) -> Formulario:
    """Copia el formulario con un slug nuevo.

    Se hereda todo lo configurable, webhook incluido: duplicar existe para
    editar una pregunta sin rearmar el resto, y volver a pegar la URL de n8n en
    cada copia es parte de ese trabajo repetido.

    Lo único que no se hereda es `activo`. La copia entra inactiva porque entre
    duplicar y terminar de editar hay un rato en que el formulario está a
    medias, y en ese rato nadie deberia poder responderlo.
    """
    original = db.get(Formulario, formulario_id)
    if not original:
        raise HTTPException(404, "Formulario no encontrado.")

    # Sufijo incremental hasta encontrar un slug libre; el unique de la tabla
    # sigue siendo la última palabra si dos admins duplican a la vez.
    base = original.slug[:70]
    for n in range(2, 100):
        slug = f"{base}-copia{'' if n == 2 else f'-{n}'}"
        if not repo.get_por_slug(db, slug):
            break
    else:
        raise HTTPException(409, "Demasiadas copias de este formulario.")

    copia = Formulario(
        slug=slug,
        titulo=f"{original.titulo} (copia)"[:200],
        definicion=original.definicion,
        n8n_webhook_url=original.n8n_webhook_url,
        activo=False,
        creado_por=usuario.username,
    )
    db.add(copia)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "No se pudo duplicar: el slug ya existe.")
    db.refresh(copia)
    return copia


@router.get("/{formulario_id}/respuestas", response_model=list[RespuestaOut])
def respuestas(formulario_id: int, db: Db, limit: int = 200) -> list[dict]:
    limit = max(1, min(1000, limit))
    return repo.respuestas_de(db, formulario_id, limit)
