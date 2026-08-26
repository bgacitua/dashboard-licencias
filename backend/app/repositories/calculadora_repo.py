from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.country_config import CountryConfig


# --- Perú: métricas de nómina para el reparto de utilidades ------------------
# Dos queries separadas a propósito: sumar base_wage dentro del JOIN con
# historical_settlements lo duplicaría una vez por cada liquidación mensual.

SQL_PERU_SUELDOS_ACTIVOS = text("""
    SELECT COALESCE(SUM(e.base_wage), 0) AS sueldo_base_mensual_actual
    FROM rh_peru.employees e
    WHERE e.status = 'activo'
""")

SQL_PERU_DIAS_TRABAJADOS = text("""
    SELECT COALESCE(SUM(hs.dias_trabajados), 0) AS dias_trabajados_actuales
    FROM rh_peru.historical_settlements hs
    JOIN rh_peru.employees e
      ON e.document_number = hs.document_number
    WHERE e.status = 'activo'
      AND hs.pay_period >= :inicio_anio_actual
      AND hs.pay_period < :inicio_anio_siguiente
""")


class CalculadoraRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_country_config(self, pais: str) -> Optional[CountryConfig]:
        return (
            self.db.query(CountryConfig)
            .filter(CountryConfig.pais == pais)
            .first()
        )

    def get_peru_sueldo_base_mensual_activo(self) -> Decimal:
        """Suma de base_wage de los empleados activos (una fila por empleado)."""
        return Decimal(str(self.db.execute(SQL_PERU_SUELDOS_ACTIVOS).scalar() or 0))

    def get_peru_dias_trabajados(self, inicio_anio: date, inicio_anio_siguiente: date) -> Decimal:
        """Días trabajados acumulados del año calendario en curso."""
        val = self.db.execute(
            SQL_PERU_DIAS_TRABAJADOS,
            {
                "inicio_anio_actual": inicio_anio,
                "inicio_anio_siguiente": inicio_anio_siguiente,
            },
        ).scalar()
        return Decimal(str(val or 0))

