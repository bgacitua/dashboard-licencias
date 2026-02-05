from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.db.deps import get_db
from app.services.vacaciones_service import VacacionesService
from app.schemas.vacaciones import VacacionBase

router = APIRouter()

@router.get("/vacaciones", response_model=List[VacacionBase])
def get_vacaciones(db: Session = Depends(get_db)):
    return VacacionesService(db).get_vacaciones()
    