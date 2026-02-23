from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Optional
from datetime import date
from app.core.logging_config import logger


class ContractAlertsRepository:
    """Repositorio para operaciones con alertas de contratos en SQL Server"""

    def __init__(self, db: Session):
        self.db = db

    def get_pending_alerts(self, end_date: Optional[date] = None) -> List[Dict[str, Any]]:
        """
        Obtiene alertas pendientes dentro del rango de fechas.
        Si end_date se provee, busca desde hoy hasta end_date.
        Si no, usa el rango por defecto de 16 días.
        """
        if end_date:
            query = text("""
                SELECT 
                    employee_name, employee_rut, employee_role, email,
                    boss_name, boss_email, boss_of_boss_email,
                    FORMAT(alert_date, 'dd-MM-yyyy') AS alert_date,
                    alert_reason, expiration, days_since_start, 
                    employee_start_date, alert_type
                FROM contract_alerts 
                WHERE
                    NOT (alert_type = 'INDEFINIDO' AND second_alert_sent != 0)
                AND 
                    NOT (alert_type = 'SEGUNDO_PLAZO' AND first_alert_sent != 0)
                AND
                    alert_date BETWEEN CAST(GETDATE() AS DATE) AND :end_date
                ORDER BY alert_date ASC
            """)
            params = {"end_date": end_date}
        else:
            query = text("""
                SELECT 
                    employee_name, employee_rut, employee_role, email,
                    boss_name, boss_email, boss_of_boss_email,
                    FORMAT(alert_date, 'dd-MM-yyyy') AS alert_date,
                    alert_reason, expiration, days_since_start, 
                    employee_start_date, alert_type
                FROM contract_alerts 
                WHERE
                    NOT (alert_type = 'INDEFINIDO' AND second_alert_sent != 0)
                AND 
                    NOT (alert_type = 'SEGUNDO_PLAZO' AND first_alert_sent != 0)
                AND
                    alert_date BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY, 16, CAST(GETDATE() AS DATE))
                ORDER BY alert_date ASC
            """)
            params = {}

        try:
            result = self.db.execute(query, params)
            columns = result.keys()
            rows = [dict(zip(columns, row)) for row in result.fetchall()]
            logger.info(f"Alertas pendientes obtenidas: {len(rows)}")
            return rows
        except Exception as e:
            logger.error(f"Error obteniendo alertas pendientes: {e}")
            return []

    def get_incidencias_by_rut(self, rut: str) -> List[Dict[str, Any]]:
        """Obtiene incidencias/permisos de un empleado por RUT."""
        query = text("""
            SELECT
                rut_empleado,
                FORMAT(fecha_inicio, 'dd-MM-yy') AS fecha_inicio_formato,
                FORMAT(fecha_fin, 'dd-MM-yy') AS fecha_fin_formato,
                CONCAT(
                    UPPER(LEFT(REPLACE(tipo_permiso, '_', ' '), 1)),
                    LOWER(SUBSTRING(
                        REPLACE(tipo_permiso, '_', ' '), 
                        2, 
                        LEN(REPLACE(tipo_permiso, '_', ' '))
                    ))
                ) AS tipo_permiso
            FROM consolidado_incidencias
            WHERE rut_empleado = :rut
        """)
        try:
            result = self.db.execute(query, {"rut": rut})
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            logger.error(f"Error obteniendo incidencias para RUT {rut}: {e}")
            return []

    def get_all_incidencias(self) -> List[Dict[str, Any]]:
        """Obtiene todas las incidencias activas"""
        query = text("""
            SELECT
                rut_empleado,
                fecha_inicio, fecha_fin,
                FORMAT(fecha_inicio, 'dd-MM-yy') AS fecha_inicio_formato,
                FORMAT(fecha_fin, 'dd-MM-yy') AS fecha_fin_formato,
                tipo_permiso AS tipo_permiso_original,
                CONCAT(
                    UPPER(LEFT(REPLACE(tipo_permiso, '_', ' '), 1)),
                    LOWER(SUBSTRING(
                        REPLACE(tipo_permiso, '_', ' '), 
                        2, 
                        LEN(REPLACE(tipo_permiso, '_', ' '))
                    ))
                ) AS tipo_permiso
            FROM consolidado_incidencias
        """)
        try:
            result = self.db.execute(query)
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            logger.error(f"Error obteniendo incidencias: {e}")
            return []

    def get_alert_type(self, employee_rut: str) -> Optional[str]:
        """Obtiene el tipo de alerta para un empleado"""
        query = text("SELECT alert_type FROM contract_alerts WHERE employee_rut = :rut")
        try:
            result = self.db.execute(query, {"rut": employee_rut})
            row = result.fetchone()
            return row[0] if row else None
        except Exception as e:
            logger.error(f"Error obteniendo tipo de alerta para {employee_rut}: {e}")
            return None

    def check_alert_processed(self, employee_rut: str, alert_type: str) -> bool:
        """Verifica si una alerta ya fue procesada/enviada"""
        if alert_type == 'SEGUNDO_PLAZO':
            campo = 'first_alert_sent'
        elif alert_type == 'INDEFINIDO':
            campo = 'second_alert_sent'
        else:
            return False

        query = text(f"SELECT {campo} FROM contract_alerts WHERE employee_rut = :rut")
        try:
            result = self.db.execute(query, {"rut": employee_rut})
            row = result.fetchone()
            return bool(row[0]) if row else False
        except Exception as e:
            logger.error(f"Error verificando alerta procesada para {employee_rut}: {e}")
            return False

    def mark_as_processed(self, employee_rut: str, alert_type: str) -> bool:
        """Marca una alerta como procesada/enviada en la base de datos"""
        if alert_type == 'SEGUNDO_PLAZO':
            campo = 'first_alert_sent = 1'
        elif alert_type == 'INDEFINIDO':
            campo = 'second_alert_sent = 1, first_alert_sent = 1'
        else:
            return False

        query = text(f"""
            UPDATE contract_alerts 
            SET {campo}, updated_at = GETDATE()
            WHERE employee_rut = :rut
        """)
        try:
            result = self.db.execute(query, {"rut": employee_rut})
            if result.rowcount > 0:
                self.db.commit()
                logger.info(f"Alerta marcada como enviada - RUT: {employee_rut}")
                return True
            return False
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error actualizando BD para {employee_rut}: {e}")
            return False

    # ================================================================
    # Calendario de Cierres
    # ================================================================

    def get_cierres_by_year(self, anio: int) -> List[Dict[str, Any]]:
        """Obtiene todas las fechas de cierre de un año"""
        query = text("""
            SELECT id, anio, mes, fecha_cierre
            FROM App.CalendarioCierres
            WHERE anio = :anio
            ORDER BY mes ASC
        """)
        try:
            result = self.db.execute(query, {"anio": anio})
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            logger.error(f"Error obteniendo cierres del año {anio}: {e}")
            return []

    def get_cierre_by_month(self, anio: int, mes: int) -> Optional[Dict[str, Any]]:
        """Obtiene la fecha de cierre de un mes específico"""
        query = text("""
            SELECT id, anio, mes, fecha_cierre
            FROM App.CalendarioCierres
            WHERE anio = :anio AND mes = :mes
        """)
        try:
            result = self.db.execute(query, {"anio": anio, "mes": mes})
            row = result.fetchone()
            if row:
                columns = result.keys()
                return dict(zip(columns, row))
            return None
        except Exception as e:
            logger.error(f"Error obteniendo cierre {mes}/{anio}: {e}")
            return None

    def upsert_cierre(self, anio: int, mes: int, fecha_cierre: date) -> bool:
        """Crea o actualiza una fecha de cierre para un mes/año"""
        existing = self.get_cierre_by_month(anio, mes)
        try:
            if existing:
                query = text("""
                    UPDATE App.CalendarioCierres 
                    SET fecha_cierre = :fecha_cierre
                    WHERE anio = :anio AND mes = :mes
                """)
            else:
                query = text("""
                    INSERT INTO App.CalendarioCierres (anio, mes, fecha_cierre)
                    VALUES (:anio, :mes, :fecha_cierre)
                """)
            self.db.execute(query, {"anio": anio, "mes": mes, "fecha_cierre": fecha_cierre})
            self.db.commit()
            logger.info(f"Cierre {'actualizado' if existing else 'creado'}: {mes}/{anio} -> {fecha_cierre}")
            return True
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error guardando cierre {mes}/{anio}: {e}")
            return False

    def delete_cierre(self, cierre_id: int) -> bool:
        """Elimina una fecha de cierre"""
        query = text("DELETE FROM App.CalendarioCierres WHERE id = :id")
        try:
            result = self.db.execute(query, {"id": cierre_id})
            if result.rowcount > 0:
                self.db.commit()
                return True
            return False
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error eliminando cierre {cierre_id}: {e}")
            return False

