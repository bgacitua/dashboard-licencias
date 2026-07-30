from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Optional
from datetime import date
from app.core.logging_config import logger


class ContractAlertsRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_pending_alerts(self, end_date: Optional[date] = None) -> List[Dict[str, Any]]:
        """Alertas pendientes en el rango de fechas (solo empleados activos)."""
        query = text("""
            SELECT
                ca.employee_id, ca.employee_name, ca.rut AS employee_rut, ca.employee_role, ca.email,
                ca.boss_name, ca.boss_email, ca.boss_of_boss_email,
                TO_CHAR(ca.alert_date, 'DD-MM-YYYY') AS alert_date,
                ca.alert_date AS alert_date_raw,
                ca.alert_reason, ca.expiration, ca.days_since_start,
                ca.employee_start_date, ca.alert_type
            FROM rh.contract_alerts ca
            JOIN rh.employees e ON e.rut = ca.rut
            WHERE
                LOWER(e.status) = 'activo'
                AND NOT (ca.alert_type = 'INDEFINIDO' AND ca.second_alert_sent)
                AND NOT (ca.alert_type = 'SEGUNDO_PLAZO' AND ca.first_alert_sent)
                AND ca.alert_date BETWEEN CURRENT_DATE
                    AND COALESCE(:end_date, CURRENT_DATE + INTERVAL '16 days')
            ORDER BY ca.alert_date ASC
        """)
        params = {"end_date": end_date}

        try:
            result = self.db.execute(query, params)
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            logger.error(f"Error obteniendo alertas pendientes: {e}")
            return []

    def get_incidencias_by_rut(self, rut: str) -> List[Dict[str, Any]]:
        """Incidencias/permisos de un empleado por RUT."""
        query = text("""
            SELECT
                e.rut AS rut_empleado,
                TO_CHAR(ci.start_date, 'DD-MM-YY') AS fecha_inicio_formato,
                TO_CHAR(ci.end_date, 'DD-MM-YY')   AS fecha_fin_formato,
                CONCAT(
                    UPPER(LEFT(REPLACE(ci.type_permission, '_', ' '), 1)),
                    LOWER(SUBSTRING(REPLACE(ci.type_permission, '_', ' '), 2))
                ) AS tipo_permiso
            FROM rh.consolidado_incidencias ci
            JOIN rh.employees e ON ci.employee_id = e.person_id
            WHERE e.rut = :rut
        """)
        try:
            result = self.db.execute(query, {"rut": rut})
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            logger.error(f"Error obteniendo incidencias para RUT {rut}: {e}")
            return []

    def get_all_incidencias(self) -> List[Dict[str, Any]]:
        """Todas las incidencias."""
        query = text("""
            SELECT
                e.rut              AS rut_empleado,
                ci.start_date      AS fecha_inicio,
                ci.end_date        AS fecha_fin,
                TO_CHAR(ci.start_date, 'DD-MM-YY') AS fecha_inicio_formato,
                TO_CHAR(ci.end_date, 'DD-MM-YY')   AS fecha_fin_formato,
                ci.type_permission AS tipo_permiso_original,
                CONCAT(
                    UPPER(LEFT(REPLACE(ci.type_permission, '_', ' '), 1)),
                    LOWER(SUBSTRING(REPLACE(ci.type_permission, '_', ' '), 2))
                ) AS tipo_permiso
            FROM rh.consolidado_incidencias ci
            JOIN rh.employees e ON ci.employee_id = e.person_id
        """)
        try:
            result = self.db.execute(query)
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            logger.error(f"Error obteniendo incidencias: {e}")
            return []

    def get_alert_type(self, employee_rut: str) -> Optional[str]:
        query = text("SELECT alert_type FROM contract_alerts WHERE rut = :rut")
        try:
            result = self.db.execute(query, {"rut": employee_rut})
            row = result.fetchone()
            return row[0] if row else None
        except Exception as e:
            logger.error(f"Error obteniendo tipo de alerta para {employee_rut}: {e}")
            return None

    def get_alert_types_and_processed_batch(self, ruts: List[str]) -> Dict[str, Dict[str, Any]]:
        if not ruts:
            return {}
        placeholders = ", ".join(f":r{i}" for i in range(len(ruts)))
        params = {f"r{i}": r for i, r in enumerate(ruts)}
        query = text(f"""
            SELECT rut AS employee_rut, alert_type, first_alert_sent, second_alert_sent
            FROM rh.contract_alerts
            WHERE rut IN ({placeholders})
        """)
        try:
            result = self.db.execute(query, params)
            keys = list(result.keys())
            rows = result.fetchall()
            idx_rut    = keys.index("employee_rut")
            idx_type   = keys.index("alert_type")
            idx_first  = keys.index("first_alert_sent")
            idx_second = keys.index("second_alert_sent")
            out: Dict[str, Dict[str, Any]] = {}
            for row in rows:
                rut    = row[idx_rut]
                at     = row[idx_type]
                first  = bool(row[idx_first])  if row[idx_first]  is not None else False
                second = bool(row[idx_second]) if row[idx_second] is not None else False
                if at == "SEGUNDO_PLAZO":
                    processed = first
                elif at == "INDEFINIDO":
                    processed = second
                else:
                    processed = False
                out[rut] = {"alert_type": at, "processed": processed}
            return out
        except Exception as e:
            logger.error(f"Error en get_alert_types_and_processed_batch: {e}")
            return {}

    def check_alert_processed(self, employee_rut: str, alert_type: str) -> bool:
        if alert_type == 'SEGUNDO_PLAZO':
            campo = 'first_alert_sent'
        elif alert_type == 'INDEFINIDO':
            campo = 'second_alert_sent'
        else:
            return False
        query = text(f"SELECT {campo} FROM rh.contract_alerts WHERE rut = :rut")
        try:
            result = self.db.execute(query, {"rut": employee_rut})
            row = result.fetchone()
            return bool(row[0]) if row else False
        except Exception as e:
            logger.error(f"Error verificando alerta procesada para {employee_rut}: {e}")
            return False

    def mark_as_processed(self, employee_rut: str, alert_type: str) -> bool:
        if alert_type == 'SEGUNDO_PLAZO':
            campo = 'first_alert_sent = TRUE'
        elif alert_type == 'INDEFINIDO':
            campo = 'second_alert_sent = TRUE, first_alert_sent = TRUE'
        else:
            return False
        query = text(f"""
            UPDATE rh.contract_alerts
            SET {campo}, updated_at = NOW()
            WHERE rut = :rut
        """)
        try:
            result = self.db.execute(query, {"rut": employee_rut})
            if result.rowcount > 0:
                self.db.commit()
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
        query = text("""
            SELECT id, anio, mes, fecha_cierre
            FROM app.calendariocierres
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
        query = text("""
            SELECT id, anio, mes, fecha_cierre
            FROM app.calendariocierres
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
        existing = self.get_cierre_by_month(anio, mes)
        try:
            if existing:
                query = text("""
                    UPDATE app.calendariocierres
                    SET fecha_cierre = :fecha_cierre
                    WHERE anio = :anio AND mes = :mes
                """)
            else:
                query = text("""
                    INSERT INTO app.calendariocierres (anio, mes, fecha_cierre)
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
        query = text("DELETE FROM app.calendariocierres WHERE id = :id")
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
