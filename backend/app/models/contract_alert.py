from sqlalchemy import Column, Integer, String, Date, DateTime, Boolean
from app.db.base import Base


class ContractAlert(Base):
    """
    Mapeado a rh.contract_alerts (tabla existente, poblada por Airflow).
    Se usa solo como referencia ORM; las operaciones son via raw SQL en el repositorio.
    """
    __tablename__ = "contract_alerts"
    __table_args__ = {'schema': 'rh'}

    employee_id = Column(Integer, primary_key=True)
    rut = Column(String(20), nullable=False, index=True)
    employee_name = Column(String(255), nullable=False)
    employee_role = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    boss_name = Column(String(255), nullable=True)
    boss_email = Column(String(255), nullable=True)
    boss_of_boss_email = Column(String(255), nullable=True)
    alert_date = Column(Date, nullable=True)
    alert_reason = Column(String(500), nullable=True)
    expiration = Column(Integer, nullable=True)
    days_since_start = Column(Integer, nullable=True)
    employee_start_date = Column(Date, nullable=True)
    alert_type = Column(String(50), nullable=True)
    first_alert_sent = Column(Boolean, default=False)
    second_alert_sent = Column(Boolean, default=False)
    updated_at = Column(DateTime, nullable=True)
