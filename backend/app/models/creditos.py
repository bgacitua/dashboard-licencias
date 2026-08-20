from sqlalchemy import Column, Integer, BigInteger, Numeric, String, Date, DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base import Base


class Credito(Base):
    __tablename__ = "creditos"
    __table_args__ = {"schema": "app"}

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, nullable=False, index=True)
    rut = Column(String(20), nullable=True)
    nombre_trabajador = Column(String(200), nullable=True)

    nombre = Column(String(200), nullable=False, default="Préstamo Interno")
    tipo = Column(String(50), nullable=False, default="credito_personal")
    tipo_prestamo = Column(String(50), nullable=False, default="Préstamo Emergencia")
    start_date = Column(Date, nullable=False)
    moneda = Column(String(10), nullable=False, default="peso")
    amount = Column(Numeric(12, 2), nullable=False)
    cuota_actual = Column(Integer, nullable=False, default=1)
    duracion = Column(Integer, nullable=False)
    monto_original = Column(Numeric(12, 2), nullable=True)
    equivalente_pesos = Column(BigInteger, nullable=True)
    comentario = Column(Text, nullable=True)
    dia_uf = Column(String(2), nullable=True)

    buk_file_id = Column(Integer, nullable=True)
    buk_credit_id = Column(Integer, nullable=True)
    estado = Column(String(30), nullable=False, default="borrador", index=True)
    firmas_requeridas = Column(JSONB, nullable=False, default=dict)
    firmas_estado = Column(JSONB, nullable=True)

    created_by = Column(String(150), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
