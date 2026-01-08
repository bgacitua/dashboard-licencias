from sqlalchemy import Column, Integer, String, Date

class Licencia(Base):
    # Nombre de la tabla en SQL Server
    __tablename__ = "licencias"

    # Columnas
    id = Column(Integer, primary_key=True, index=True) # ID único autoincremental
    nombre_trabajador = Column(String(255), nullable=False) # Nombre del empleado
    rut_trabajador = Column(String(20), nullable=True) # RUT/DNI (Opcional pero recomendado)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    motivo = Column(String(500), nullable=True) # Detalle médico o administrativo