"""Endpoints públicos del módulo — sin autenticación.

Quien abre el formulario llega por un QR y no tiene cuenta en la plataforma.
Las credenciales son: el RUT contra rh.employees en el gate, y después el
token de un solo uso que ese gate emite.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.rate_limit import check_rate_limit, client_ip
from app.db.deps import get_db

from . import repository as repo
from . import service
from .config import FormulariosSettings, get_settings
from .schemas import (
    FormularioPublicoOut,
    GateRequest,
    GateResponse,
    SubmitRequest,
    SubmitResponse,
)

publico = APIRouter(prefix="/publico", tags=["formularios-publico"])

Db = Annotated[Session, Depends(get_db)]
Cfg = Annotated[FormulariosSettings, Depends(get_settings)]

# Mensaje único también para el token: no distingue expirado de ya usado de
# inexistente.
TOKEN_ERROR = "Este enlace ya no es válido. Vuelve a validar tu RUT."


@publico.post("/validar", response_model=GateResponse)
def validar(datos: GateRequest, request: Request, db: Db, cfg: Cfg) -> GateResponse:
    check_rate_limit(
        f"form_gate:{client_ip(request)}", cfg.gate_max_intentos, cfg.gate_ventana_seg
    )
    redirect = service.emitir_token(db, cfg, datos.slug, datos.rut)
    if not redirect:
        return GateResponse(ok=False, mensaje=service.GATE_ERROR)
    return GateResponse(ok=True, redirect=redirect)


@publico.get("/f/{slug}", response_model=FormularioPublicoOut)
def obtener(slug: str, db: Db, token: str = Query(..., max_length=64)) -> FormularioPublicoOut:
    formulario = repo.get_por_slug(db, slug)
    if not formulario or not formulario.activo:
        raise HTTPException(403, TOKEN_ERROR)
    if not repo.token_vigente(db, token, formulario.id):
        raise HTTPException(403, TOKEN_ERROR)
    return FormularioPublicoOut(titulo=formulario.titulo, definicion=formulario.definicion)


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
