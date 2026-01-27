from pydantic import BaseModel
from datetime import date
from typing import Optional

# Base: Propiedades compartidas al crear y leer
class FiniquitoBase(BaseModel):
    nombre_trabajador: str
    rut_trabajador: str
    cargo: str
    fecha_ingreso: date
    duracion_empresa: float
    estado: str
    sueldo_base: float
    nombre_jefe: Optional[str] = None
    rut_jefe: Optional[str] = None
    bonificaciones_mensuales: Optional[float] = 0
    movilizacion: Optional[int] = 0
    
# Create: Propiedades necesarias para crear (en este caso, las mismas que la base)
class FiniquitoCreate(FiniquitoBase):
    pass

# Response: Lo que devolvemos al frontend (incluye el ID generado por la BD si existe)
class FiniquitoResponse(FiniquitoBase):
    id: Optional[int] = None
    fecha_salida: Optional[date] = None
    bono_sala_cuna: Optional[int] = 0
    desgaste_vehiculo: Optional[int] = 0

    class Config:
        # Esto permite a Pydantic leer datos directamente de los modelos de SQLAlchemy
        from_attributes = True