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
    # Obligatorio a propósito: el motivo depende de si hubo intento de marcaje,
    # y un default acá taparía que el frontend dejó de calcularlo.
    mov: str
    # Registro de la operación al que pertenece, para marcarlo sincronizado.
    record_id: str | None = None


class RegistrarRequest(BaseModel):
    obra_id: str
    marcas: list[MarcaIn]
    op_id: int | None = None


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


class RegistroIn(BaseModel):
    """Un registro preparado para corregir, dentro de una operación."""

    record_id: str
    rut: str
    nombre: str = ""
    fecha: str          # yyyy-mm-dd
    hora_intento: str = ""
    sentido: str
    turno_inicio: str = ""
    turno_fin: str = ""
    status: str = "pending"


class OperacionCreate(BaseModel):
    obra_id: str
    desde: str
    hasta: str
    label: str = ""
    registros: list[RegistroIn]


class RegistroUpdate(BaseModel):
    record_id: str
    status: str         # pending | synced | discarded
