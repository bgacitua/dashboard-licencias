from sqlalchemy import Column, Integer, Date, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.db.base import Base


class CalendarioCierre(Base):
    __tablename__ = 'calendariocierres'
    __table_args__ = (
        UniqueConstraint('anio', 'mes', name='uq_anio_mes'),
        {'schema': 'app'}
    )

    id = Column(Integer, primary_key=True, index=True)
    anio = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)
    fecha_cierre = Column(Date, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
