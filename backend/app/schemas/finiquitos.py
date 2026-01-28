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

    class Config:
        from_attributes = True

# Create: Propiedades necesarias para crear
class FiniquitoCreate(FiniquitoBase):
    fecha_salida: Optional[date] = None

class FiniquitoBonificaciones(FiniquitoBase):
    bonificaciones_mensuales: Optional[float] = None
    movilizacion: Optional[int] = None

# Response: Lo que devolvemos al frontend
class FiniquitoResponse(FiniquitoBonificaciones):
    id: Optional[int] = None
    fecha_salida: Optional[date] = None
    bono_sala_cuna: Optional[int] = 0
    desgaste_vehiculo: Optional[int] = 0

    class Config:
        from_attributes = True

# Item: Salidas necesarias en formulario de finiquitos
class FiniquitoItemResponse(BaseModel):
    nombre_trabajador: Optional[str] = None
    rut_trabajador: Optional[str] = None
    cargo: Optional[str] = None
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

    class Config:
        from_attributes = True

# Create: Propiedades necesarias para crear
class FiniquitoCreate(FiniquitoBase):
    fecha_salida: Optional[date] = None

class FiniquitoBonificaciones(FiniquitoBase):
    bonificaciones_mensuales: Optional[float] = None
    movilizacion: Optional[int] = None

# Response: Lo que devolvemos al frontend
class FiniquitoResponse(FiniquitoBonificaciones):
    id: Optional[int] = None
    fecha_salida: Optional[date] = None
    bono_sala_cuna: Optional[int] = 0
    desgaste_vehiculo: Optional[int] = 0

    class Config:
        from_attributes = True

# Item: Salidas necesarias en formulario de finiquitos
class FiniquitoItemResponse(BaseModel):
    nombre_trabajador: Optional[str] = None
    rut_trabajador: Optional[str] = None
    cargo: Optional[str] = None
    fecha_ingreso: Optional[date] = None
    periodo: Optional[str] = None
    status: Optional[str] = None
    cod_area: Optional[int] = None
    nombre_area: Optional[str] = None
    liquidacion_id: Optional[int] = None
    concepto: Optional[str] = None
    income_type: Optional[str] = None
    monto: Optional[float] = 0

    class Config:
        from_attributes = True