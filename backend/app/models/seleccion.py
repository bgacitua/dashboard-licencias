from sqlalchemy import Column, Integer, String, Date, Numeric
from app.db.base import Base


class CandidatoSeleccion(Base):
    __tablename__ = "candidatos_seleccion"
    __table_args__ = {"schema": "rh"}

    id = Column(Integer, primary_key=True, index=True)
    empresa = Column(String(150), nullable=False)
    fecha_cierre = Column(Date, nullable=True)
    rut = Column(String(20), nullable=True, index=True)
    nombre = Column(String(200), nullable=False, index=True)
    cargo = Column(String(150), nullable=False)
    lugar_de_trabajo = Column(String(150), nullable=True)
    jornada_de_trabajo = Column(String(100), nullable=True)
    tipo_de_contrato = Column(String(100), nullable=True)
    fecha_de_inicio = Column(Date, nullable=True)
    gerencia = Column(String(150), nullable=True)
    sueldo_base = Column(Numeric(12, 2), nullable=True)
    bono = Column(Numeric(12, 2), nullable=True)
    movilizacion = Column(Numeric(12, 2), nullable=True)
    correo_analista = Column(String(150), nullable=True)
    status = Column(String(50), nullable=True, default="Pendiente")
