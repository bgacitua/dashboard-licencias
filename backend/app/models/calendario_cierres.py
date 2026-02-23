"""
Modelo para el calendario de cierres mensuales.
Almacena la fecha de cierre para cada mes del año.
"""
from sqlalchemy import Column, Integer, Date, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.db.base import Base


class CalendarioCierre(Base):
    """Calendario de fechas de cierre mensuales para alertas de contratos"""
    __tablename__ = 'CalendarioCierres'
    __table_args__ = (
        UniqueConstraint('anio', 'mes', name='uq_anio_mes'),
        {'schema': 'App'}
    )

    id = Column(Integer, primary_key=True, index=True)
    anio = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)  # 1-12
    fecha_cierre = Column(Date, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
