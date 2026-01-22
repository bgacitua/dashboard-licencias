from sqlalchemy import Column, Integer, String, Date
from app.db.base import Base

class Licencia(Base):
    # Nombre de la tabla en SQL Server
    __tablename__ = "licencias"

    # Columnas
    id = Column(Integer, primary_key=True, index=True)
    nombre_trabajador = Column(String(255), nullable=False, index=True)
    rut_trabajador = Column(String(20), nullable=True, index=True)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    motivo = Column(String(500), nullable=True)