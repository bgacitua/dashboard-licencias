from sqlalchemy import Column, Integer, Float, String, Date
from app.db.base import Base

class Finiquito(Base):
    # Nombre de la tabla en SQL Server
    __tablename__ = "finiquitos"

    # Columnas
    id = Column(Integer, primary_key=True, index=True)
    nombre_trabajador = Column(String(255), nullable=False, index=True)
    rut_trabajador = Column(String(20), nullable=True, index=True)
    cargo = Column(String(255), nullable=False)
    fecha_ingreso = Column(Date, nullable=False)
    fecha_salida = Column(Date, nullable=False)
    duracion_empresa = Column(Float, nullable=False)
    estado = Column(String(255), nullable=False)
    sueldo_base = Column(Float, nullable=False)
    nombre_jefe = Column(String(255), nullable=False)
    rut_jefe = Column(String(20), nullable=True, index=True)
    bonificaciones_mensuales = Column(Float, nullable=False)
    movilizacion = Column(Integer, nullable=False)
    bono_sala_cuna = Column(Integer, nullable=False)
    desgaste_vehiculo = Column(Integer, nullable=False)