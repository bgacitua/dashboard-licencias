"""Modelos Pydantic de salida del módulo."""
from typing import Any

from pydantic import BaseModel, Field


class DataResponse(BaseModel):
    """Dataset completo del rango. TanStack hace orden/filtro/paginación en el cliente."""

    rows: list[dict[str, Any]]
    total: int
    columns: list[str] = Field(default_factory=list)
    # Filas ocultadas por el filtro global de recinto (RUT no asignado a la obra).
    descartados: int = 0
