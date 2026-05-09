from typing import Optional
from sqlalchemy.orm import Session

from app.models.country_config import CountryConfig


class CalculadoraRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_country_config(self, pais: str) -> Optional[CountryConfig]:
        return (
            self.db.query(CountryConfig)
            .filter(CountryConfig.pais == pais)
            .first()
        )
