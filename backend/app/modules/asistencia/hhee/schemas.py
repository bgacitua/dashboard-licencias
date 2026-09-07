"""Entrada y salida del submodulo de horas extras.

La tabla de alertas sale como DataResponse del modulo, igual que Marcajes y
Reportes, para que el componente de tabla del frontend la consuma sin cambios.
Lo unico propio es la metadata de frescura y el resumen del refresco.
"""
from datetime import datetime

from pydantic import BaseModel, Field


class Frescura(BaseModel):
    """Cuando corrio el scraper por ultima vez, por recinto."""

    recinto: str
    ultima_vez: datetime | None = None
    alertas: int = 0


class SemanaISO(BaseModel):
    anio_iso: int
    semana_iso: int

    @property
    def clave(self) -> str:
        return f"{self.anio_iso}-W{self.semana_iso:02d}"


class RecintoSync(BaseModel):
    """Resultado del barrido de un recinto. `error` presente = ese recinto fallo."""

    recinto: str
    registros: int | None = None
    trabajadores: int | None = None
    alertas: int | None = None
    persistido: bool = False
    error: str | None = None


class SyncResponse(BaseModel):
    """Resumen que devuelve el servicio de scraping tras un refresco manual."""

    desde: str
    hasta: str
    ok: int = 0
    fallidos: int = 0
    alertas: int = 0
    recintos: list[RecintoSync] = Field(default_factory=list)
