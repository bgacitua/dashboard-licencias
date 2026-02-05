from sqlalchemy import Column, Integer, String, Date
from app.db.base import Base

class Vacacion(Base):
    # Nombre de la tabla en SQL Server
    __tablename__ = "vacaciones"

    # Columnas
    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, nullable=False)
    full_name = Column(String(255), nullable=False, index=True)
    rut = Column(String(20), nullable=True, index=True)
    working_days = Column(Integer, nullable=False)
    calendar_days = Column(Integer, nullable=False)
    workday_stage = Column(String(20), nullable=False)
    type = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
