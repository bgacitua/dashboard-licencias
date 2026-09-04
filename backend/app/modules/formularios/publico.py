"""Endpoints públicos del módulo — sin autenticación.

Quien responde no tiene cuenta en la plataforma. La credencial es el token del
enlace que RRHH le manda a su correo desde el panel: llega por un canal que
solo controla el destinatario y vale hasta que vence.

Acá no se valida ninguna identidad. Eso ocurrió antes, al enviar: el panel
resolvió el correo contra la nómina.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.rate_limit import client_ip
from app.db.deps import get_db

from . import repository as repo
from . import service
from .schemas import FormularioPublicoOut, SubmitRequest, SubmitResponse

publico = APIRouter(prefix="/publico", tags=["formularios-publico"])

Db = Annotated[Session, Depends(get_db)]

# Mensaje único: no distingue vencido de inexistente. La diferencia no le sirve
# a quien tiene el enlace y sí a quien prueba tokens al azar.
TOKEN_ERROR = (
    "Este enlace ya no es válido. Pídele a Recursos Humanos que te envíe uno nuevo."
)


@publico.get("/f/{slug}", response_model=FormularioPublicoOut)
def obtener(slug: str, db: Db, token: str = Query(..., max_length=64)) -> FormularioPublicoOut:
    formulario = repo.get_por_slug(db, slug)
    if not formulario or not formulario.activo:
        raise HTTPException(403, TOKEN_ERROR)
    if not repo.token_vigente(db, token, formulario.id):
        raise HTTPException(403, TOKEN_ERROR)
    # Si ya respondió, el formulario se abre con lo que envió: editar es
    # corregir, no rellenar de nuevo desde cero.
    previa = repo.respuesta_vigente(db, token)
    return FormularioPublicoOut(
        titulo=formulario.titulo,
        definicion=formulario.definicion,
        datos=previa["datos"] if previa else None,
        version=previa["version"] if previa else 0,
    )


@publico.post("/f/{slug}", response_model=SubmitResponse)
def enviar(slug: str, datos: SubmitRequest, request: Request, db: Db) -> SubmitResponse:
    formulario = repo.get_por_slug(db, slug)
    if not formulario or not formulario.activo:
        raise HTTPException(403, TOKEN_ERROR)
    respuesta_id = service.registrar_respuesta(
        db, formulario, datos.token, datos.datos, client_ip(request)
    )
    if respuesta_id is None:
        raise HTTPException(403, TOKEN_ERROR)
    return SubmitResponse(ok=True, respuesta_id=respuesta_id)
