from pydantic import BaseModel
from datetime import date
from typing import Optional

# Base: Propiedades compartidas al crear y leer
class LicenciaBase(BaseModel):
    nombre_trabajador: str
    rut_trabajador: Optional[str] = None
    fecha_inicio: date
    fecha_fin: date
    motivo: Optional[str] = None

# Create: Propiedades necesarias para crear (en este caso, las mismas que la base)
class LicenciaCreate(LicenciaBase):
    pass

# Response: Lo que devolvemos al frontend (incluye el ID generado por la BD)
class LicenciaResponse(LicenciaBase):
    id: int

    class Config:
        # Esto permite a Pydantic leer datos directamente de los modelos de SQLAlchemy
        from_attributes = True