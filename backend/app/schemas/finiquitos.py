from pydantic import BaseModel
from datetime import date
from typing import Optional, List, Union

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


# ============================================
# Schemas para API externa BUK (Vacaciones)
# ============================================

class VacationItem(BaseModel):
    """Representa un tipo de vacación con su stock disponible."""
    name: str
    stock: float

class CurrentJob(BaseModel):
    """Información del trabajo actual del empleado."""
    periodicity: Optional[str] = None
    zone_assignment: Optional[Union[str, bool]] = None

class EmployeeVacationsResponse(BaseModel):
    """Respuesta de la API externa de BUK con vacaciones disponibles."""
    employee_id: int
    full_name: Optional[str] = None
    nationality: Optional[str] = None
    civil_status: Optional[str] = None
    private_role: Optional[bool] = None
    code_sheet: Optional[str] = None
    pension_regime: Optional[str] = None
    pension_fund: Optional[str] = None
    current_job: Optional[CurrentJob] = None
    vacations: List[VacationItem] = []

    class Config:
        from_attributes = True

class VacacionesDisponiblesResponse(BaseModel):
    """Respuesta simplificada de vacaciones para el frontend."""
    employee_id: int
    full_name: Optional[str] = None
    vacations: List[VacationItem] = []
    total_dias_disponibles: float = 0

    class Config:
        from_attributes = True

class EmployeeSueldoResponse(BaseModel):
    """Respuesta de la API externa de BUK con sueldo base."""
    person_id: int
    full_name: Optional[str] = None
    base_wage: Optional[int] = None

    class Config:
        from_attributes = True