from pydantic import BaseModel, Field
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Literal, Dict, Any


TipoCredito = Literal["credito_personal", "dental", "leasing", "seguro_vida", "credito_otro"]
Moneda = Literal["peso", "uf"]

# El que se imprime en el comprobante. BUK siempre recibe TipoCredito aparte.
# Espeja TIPOS_PRESTAMO en frontend/src/pages/Creditos.jsx: agregar una opcion
# alla sin sumarla aca hace que el POST falle con 422 al guardar.
TipoPrestamo = Literal[
    "Préstamo Emergencia",
    "Préstamo Salud",
    "Préstamo Habitacional",
    "Préstamo Automotriz",
    "Préstamo Roaming",
    "Consolidación de deuda",
]


class CreditoBase(BaseModel):
    employee_id: int
    rut: Optional[str] = None
    nombre_trabajador: Optional[str] = None

    nombre: str = "Préstamo Interno"
    tipo: TipoCredito = "credito_personal"
    tipo_prestamo: TipoPrestamo = "Préstamo Emergencia"
    start_date: date
    moneda: Moneda = "peso"
    amount: Decimal = Field(gt=0, description="Valor de la cuota a descontar (UF admite decimales)")
    cuota_actual: int = Field(default=1, ge=1)
    duracion: int = Field(gt=0, description="Total de cuotas")
    monto_original: Optional[Decimal] = Field(default=None, description="Monto original del préstamo (UF o pesos)")
    equivalente_pesos: Optional[int] = Field(default=None, description="Equivalente en pesos del monto original")
    comentario: Optional[str] = None
    dia_uf: Optional[str] = None


class CreditoCreate(CreditoBase):
    # Flags de firma del documento (POST /employees/{id}/docs)
    visible: bool = True
    signable_by_employee: bool = True
    signable_by_legal_agent: bool = True
    # Desactivado por ahora: no hay segundo representante legal definido
    signable_by_second_legal_agent: bool = False
    overwrite: bool = False
    path: Optional[str] = "préstamo"


class CreditoUpdate(BaseModel):
    """Todo editable mientras el crédito siga en borrador (sin documento en BUK)."""
    employee_id: Optional[int] = None
    rut: Optional[str] = None
    nombre_trabajador: Optional[str] = None
    nombre: Optional[str] = None
    tipo: Optional[TipoCredito] = None
    tipo_prestamo: Optional[TipoPrestamo] = None
    start_date: Optional[date] = None
    moneda: Optional[Moneda] = None
    amount: Optional[Decimal] = Field(default=None, gt=0)
    cuota_actual: Optional[int] = Field(default=None, ge=1)
    duracion: Optional[int] = Field(default=None, gt=0)
    monto_original: Optional[Decimal] = None
    equivalente_pesos: Optional[int] = None
    comentario: Optional[str] = None
    dia_uf: Optional[str] = None

    # Vincular un documento ya existente en BUK (subido a mano o por un intento fallido)
    buk_file_id: Optional[int] = None

    # Opciones del documento en BUK
    visible: Optional[bool] = None
    signable_by_employee: Optional[bool] = None
    signable_by_legal_agent: Optional[bool] = None
    signable_by_second_legal_agent: Optional[bool] = None
    overwrite: Optional[bool] = None
    path: Optional[str] = None
    dia_uf: Optional[str] = None


class CreditoResponse(CreditoBase):
    id: int
    buk_file_id: Optional[int] = None
    buk_credit_id: Optional[int] = None
    estado: str
    firmas_requeridas: Dict[str, Any] = {}
    firmas_estado: Optional[Dict[str, Any]] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EstadoFirmaResponse(BaseModel):
    firmado: bool
    firmas_requeridas: Dict[str, bool]
    firmas_estado: Dict[str, Any]
    estado: str


class TrabajadorSugerencia(BaseModel):
    employee_id: int
    rut: Optional[str] = None
    full_name: Optional[str] = None
