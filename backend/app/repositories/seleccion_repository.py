from sqlalchemy.orm import Session
from typing import List, Optional

from app.models.seleccion import CandidatoSeleccion
from app.schemas.seleccion import CandidatoCreate, CandidatoUpdate


class SeleccionRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self) -> List[CandidatoSeleccion]:
        return self.db.query(CandidatoSeleccion).order_by(CandidatoSeleccion.id.desc()).all()

    def get_by_id(self, candidato_id: int) -> Optional[CandidatoSeleccion]:
        return self.db.query(CandidatoSeleccion).filter(CandidatoSeleccion.id == candidato_id).first()

    def get_by_rut(self, rut: str) -> List[CandidatoSeleccion]:
        return self.db.query(CandidatoSeleccion).filter(CandidatoSeleccion.rut == rut).all()

    def create(self, data: CandidatoCreate) -> CandidatoSeleccion:
        candidato = CandidatoSeleccion(**data.model_dump())
        self.db.add(candidato)
        self.db.commit()
        self.db.refresh(candidato)
        return candidato

    def update(self, candidato_id: int, data: CandidatoUpdate) -> Optional[CandidatoSeleccion]:
        candidato = self.get_by_id(candidato_id)
        if not candidato:
            return None
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(candidato, field, value)
        self.db.commit()
        self.db.refresh(candidato)
        return candidato

    def delete(self, candidato_id: int) -> bool:
        candidato = self.get_by_id(candidato_id)
        if not candidato:
            return False
        self.db.delete(candidato)
        self.db.commit()
        return True
