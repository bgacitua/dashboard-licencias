from sqlalchemy import Column, Integer, String, Date, DateTime, Boolean
from app.db.base import Base


class ContractAlert(Base):
    """Modelo para la tabla contract_alerts en SQL Server (IARRHH)"""
    __tablename__ = "contract_alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    employee_name = Column(String(255), nullable=False)
    employee_rut = Column(String(20), nullable=False, index=True)
    employee_role = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    boss_name = Column(String(255), nullable=True)
    boss_email = Column(String(255), nullable=True)
    boss_of_boss_email = Column(String(255), nullable=True)
    alert_date = Column(Date, nullable=True)
    alert_reason = Column(String(500), nullable=True)
    expiration = Column(String(100), nullable=True)
    days_since_start = Column(Integer, nullable=True)
    employee_start_date = Column(Date, nullable=True)
    alert_type = Column(String(50), nullable=True)
    first_alert_sent = Column(Integer, default=0)
    second_alert_sent = Column(Integer, default=0)
    updated_at = Column(DateTime, nullable=True)
