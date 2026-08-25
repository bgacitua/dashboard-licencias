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


class MarcaIn(BaseModel):
    """Una marca a registrar. El backend agrega la clave de recinto y el token."""

    rut: str
    i: str          # "entrada" | "salida"
    fecha: str      # d/M/yyyy
    hora: str       # H:m:s
    mov: str = "sistema automático"


class RegistrarRequest(BaseModel):
    obra_id: str
    marcas: list[MarcaIn]


class MarcaResult(BaseModel):
    rut: str
    i: str
    fecha: str
    ok: bool
    detail: str = ""


class RegistrarResponse(BaseModel):
    # true = nada se envió a Buk; el payload quedó en el log.
    dry_run: bool
    enviadas: int
    fallidas: int
    resultados: list[MarcaResult]
