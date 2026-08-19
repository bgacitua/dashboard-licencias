from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.db.deps import get_db
from app.core.security import require_role
from app.core.logging_config import logger
from app.schemas.creditos import (
    CreditoCreate,
    CreditoUpdate,
    CreditoResponse,
    EstadoFirmaResponse,
    TrabajadorSugerencia,
)
from app.services.creditos_service import CreditosService, CreditoFlowError, BukError, nombre_archivo

router = APIRouter()

ROLES = ["admin", "rrhh"]


def _get_credito(service: CreditosService, credito_id: int):
    credito = service.get_by_id(credito_id)
    if not credito:
        raise HTTPException(status_code=404, detail="Crédito no encontrado")
    return credito


# ponytail: un solo traductor de excepciones para los 5 pasos del flujo,
# en vez de repetir try/except en cada endpoint.
async def _ejecutar(coro):
    try:
        return await coro
    except CreditoFlowError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except BukError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/catalogo/trabajadores", response_model=List[TrabajadorSugerencia])
def buscar_trabajadores(
    q: str = Query("", description="Nombre o RUT"),
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    return CreditosService(db).buscar_trabajadores(q)


@router.get("/", response_model=List[CreditoResponse])
def listar_creditos(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    return CreditosService(db).get_all()


@router.post("/", response_model=CreditoResponse, status_code=201)
def crear_credito(
    data: CreditoCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    try:
        return CreditosService(db).create(data, created_by=current_user.username)
    except Exception as e:
        logger.error(f"Error creando crédito: {e}")
        raise HTTPException(status_code=500, detail="Error al crear el crédito")


@router.get("/{credito_id}", response_model=CreditoResponse)
def obtener_credito(
    credito_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    return _get_credito(CreditosService(db), credito_id)


@router.put("/{credito_id}", response_model=CreditoResponse)
def actualizar_credito(
    credito_id: int,
    data: CreditoUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    service = CreditosService(db)
    _get_credito(service, credito_id)
    try:
        return service.update(credito_id, data)
    except CreditoFlowError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.delete("/{credito_id}", status_code=204)
def eliminar_credito(
    credito_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    service = CreditosService(db)
    _get_credito(service, credito_id)
    try:
        service.delete(credito_id)
    except CreditoFlowError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/{credito_id}/pagare")
async def previsualizar_pagare(
    credito_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    service = CreditosService(db)
    credito = _get_credito(service, credito_id)
    return Response(
        content=await _ejecutar(service.generar_pdf(credito)),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{nombre_archivo(credito)}"'},
    )


# Paso 1: generar el pagaré y subirlo a BUK
@router.post("/{credito_id}/documento", response_model=CreditoResponse)
async def subir_documento(
    credito_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    service = CreditosService(db)
    credito = _get_credito(service, credito_id)
    return await _ejecutar(service.subir_documento(credito))


# Paso 2: disparar el flujo de firma
@router.post("/{credito_id}/firma", response_model=CreditoResponse)
async def iniciar_firma(
    credito_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    service = CreditosService(db)
    credito = _get_credito(service, credito_id)
    return await _ejecutar(service.iniciar_firma(credito))


# Paso 3: revisar si el documento ya está firmado
@router.get("/{credito_id}/firma", response_model=EstadoFirmaResponse)
async def verificar_firma(
    credito_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    service = CreditosService(db)
    credito = _get_credito(service, credito_id)
    return await _ejecutar(service.verificar_firma(credito))


# Paso 4: cargar el crédito en BUK
@router.post("/{credito_id}/credito-buk", response_model=CreditoResponse)
async def crear_credito_buk(
    credito_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    service = CreditosService(db)
    credito = _get_credito(service, credito_id)
    return await _ejecutar(service.crear_credito_buk(credito))


@router.get("/{credito_id}/credito-buk", response_model=Dict[str, Any])
async def verificar_credito_buk(
    credito_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(ROLES)),
):
    service = CreditosService(db)
    credito = _get_credito(service, credito_id)
    return await _ejecutar(service.verificar_credito(credito))
