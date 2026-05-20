from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List

from app.db.deps import get_db
from app.services.seleccion_service import SeleccionService
from app.schemas.seleccion import CandidatoCreate, CandidatoUpdate, CandidatoResponse
from app.core.security import require_role
from app.core.logging_config import logger

router = APIRouter()


@router.get("/", response_model=List[CandidatoResponse])
def get_candidatos(
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin", "seleccion"])),
):
    return SeleccionService(db).get_all()


@router.get("/{candidato_id}", response_model=CandidatoResponse)
def get_candidato(
    candidato_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin", "seleccion"])),
):
    candidato = SeleccionService(db).get_by_id(candidato_id)
    if not candidato:
        raise HTTPException(status_code=404, detail="Candidato no encontrado")
    return candidato


@router.get("/rut/{rut}", response_model=List[CandidatoResponse])
def get_candidatos_por_rut(
    rut: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin", "seleccion"])),
):
    return SeleccionService(db).get_by_rut(rut)


@router.post("/", response_model=CandidatoResponse, status_code=201)
def crear_candidato(
    data: CandidatoCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin", "seleccion"])),
):
    try:
        return SeleccionService(db).create(data)
    except Exception as e:
        logger.error(f"Error creando candidato: {e}")
        raise HTTPException(status_code=500, detail="Error al crear candidato")


@router.put("/{candidato_id}", response_model=CandidatoResponse)
def actualizar_candidato(
    candidato_id: int,
    data: CandidatoUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin", "seleccion"])),
):
    candidato = SeleccionService(db).update(candidato_id, data)
    if not candidato:
        raise HTTPException(status_code=404, detail="Candidato no encontrado")
    return candidato


@router.delete("/{candidato_id}", status_code=204)
def eliminar_candidato(
    candidato_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin", "seleccion"])),
):
    ok = SeleccionService(db).delete(candidato_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Candidato no encontrado")


@router.get("/{candidato_id}/carta-oferta")
def descargar_carta_oferta(
    candidato_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role(["admin", "seleccion"])),
):
    try:
        service = SeleccionService(db)
        candidato = service.get_by_id(candidato_id)
        if not candidato:
            raise HTTPException(status_code=404, detail="Candidato no encontrado")
        docx_bytes = service.generar_carta_oferta(candidato_id)
        nombre_archivo = f"carta_oferta_{candidato.nombre.replace(' ', '_')}.docx"
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{nombre_archivo}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generando carta oferta para candidato {candidato_id}: {e}")
        raise HTTPException(status_code=500, detail="Error al generar carta de oferta")
