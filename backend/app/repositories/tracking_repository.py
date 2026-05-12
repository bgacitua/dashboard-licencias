from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Optional
from datetime import date, datetime
from app.core.logging_config import logger


class TrackingRepository:
    def __init__(self, db: Session):
        self.db = db

    def upsert_tracking(
        self,
        employee_id: int,
        rut: str,
        employee_name: str,
        employee_role: str,
        boss_name: str,
        boss_email: str,
        alert_date: date,
        alert_type: str,
        alert_reason: str,
    ) -> Optional[str]:
        """
        Crea o actualiza registro de seguimiento.
        Retorna el response_token UUID como string.
        """
        query = text("""
            INSERT INTO app.contract_alert_tracking (
                employee_id, rut, employee_name, employee_role,
                boss_name, boss_email, alert_date, alert_type, alert_reason,
                first_sent_at, last_followup_at, updated_at
            )
            VALUES (
                :employee_id, :rut, :employee_name, :employee_role,
                :boss_name, :boss_email, :alert_date, :alert_type, :alert_reason,
                NOW(), NOW(), NOW()
            )
            ON CONFLICT (employee_id, alert_date)
            DO UPDATE SET
                last_followup_at = NOW(),
                followup_count   = app.contract_alert_tracking.followup_count + 1,
                boss_name        = EXCLUDED.boss_name,
                boss_email       = EXCLUDED.boss_email,
                alert_type       = EXCLUDED.alert_type,
                alert_reason     = EXCLUDED.alert_reason,
                updated_at       = NOW()
            RETURNING response_token::text
        """)
        try:
            result = self.db.execute(query, {
                "employee_id": employee_id,
                "rut": rut,
                "employee_name": employee_name,
                "employee_role": employee_role,
                "boss_name": boss_name,
                "boss_email": boss_email,
                "alert_date": alert_date,
                "alert_type": alert_type,
                "alert_reason": alert_reason,
            })
            self.db.commit()
            row = result.fetchone()
            return row[0] if row else None
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error en upsert_tracking para employee_id={employee_id}: {e}")
            return None

    def get_by_token(self, token: str) -> Optional[Dict[str, Any]]:
        query = text("""
            SELECT
                id, employee_id, rut, employee_name, employee_role,
                boss_name, boss_email,
                TO_CHAR(alert_date, 'YYYY-MM-DD') AS alert_date,
                alert_type, alert_reason,
                response_token::text AS response_token,
                first_sent_at, response, responded_at,
                buk_synced
            FROM app.contract_alert_tracking
            WHERE response_token = :token::uuid
        """)
        try:
            result = self.db.execute(query, {"token": token})
            columns = result.keys()
            row = result.fetchone()
            return dict(zip(columns, row)) if row else None
        except Exception as e:
            logger.error(f"Error get_by_token {token}: {e}")
            return None

    def set_response(self, token: str, response: str) -> bool:
        query = text("""
            UPDATE app.contract_alert_tracking
            SET response = :response, responded_at = NOW(), updated_at = NOW()
            WHERE response_token = :token::uuid
              AND response IS NULL
        """)
        try:
            self.db.execute(query, {"token": token, "response": response})
            self.db.commit()
            return True
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error set_response: {e}")
            return False

    def get_all_tracking(self) -> List[Dict[str, Any]]:
        query = text("""
            SELECT
                id,
                employee_id,
                rut,
                employee_name,
                employee_role,
                boss_name,
                boss_email,
                TO_CHAR(alert_date, 'DD-MM-YYYY') AS alert_date,
                alert_type,
                alert_reason,
                response_token::text AS response_token,
                TO_CHAR(first_sent_at AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI') AS first_sent_at,
                TO_CHAR(last_followup_at AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI') AS last_followup_at,
                followup_count,
                response,
                TO_CHAR(responded_at AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI') AS responded_at,
                buk_synced,
                TO_CHAR(buk_synced_at AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI') AS buk_synced_at,
                buk_sync_error
            FROM app.contract_alert_tracking
            ORDER BY alert_date ASC, employee_name ASC
        """)
        try:
            result = self.db.execute(query)
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            logger.error(f"Error get_all_tracking: {e}")
            return []

    def get_pending_followups(self) -> List[Dict[str, Any]]:
        """
        Retorna registros sin respuesta que necesitan seguimiento:
        - 3+ días desde último contacto, O
        - 3 días o menos para el vencimiento
        Y que el contrato no haya vencido.
        """
        query = text("""
            SELECT
                id, employee_id, rut, employee_name, employee_role,
                boss_name, boss_email,
                alert_date,
                TO_CHAR(alert_date, 'DD-MM-YYYY') AS alert_date_fmt,
                alert_type, alert_reason,
                response_token::text AS response_token,
                followup_count
            FROM app.contract_alert_tracking
            WHERE response IS NULL
              AND alert_date >= CURRENT_DATE
              AND (
                (CURRENT_DATE - last_followup_at::date) >= 3
                OR (alert_date - CURRENT_DATE) <= 3
              )
            ORDER BY alert_date ASC
        """)
        try:
            result = self.db.execute(query)
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            logger.error(f"Error get_pending_followups: {e}")
            return []

    def mark_buk_synced(self, tracking_id: int, error: Optional[str] = None) -> None:
        if error:
            query = text("""
                UPDATE app.contract_alert_tracking
                SET buk_synced = FALSE, buk_sync_error = :error, updated_at = NOW()
                WHERE id = :id
            """)
            params = {"id": tracking_id, "error": error}
        else:
            query = text("""
                UPDATE app.contract_alert_tracking
                SET buk_synced = TRUE, buk_synced_at = NOW(), buk_sync_error = NULL, updated_at = NOW()
                WHERE id = :id
            """)
            params = {"id": tracking_id}
        try:
            self.db.execute(query, params)
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error mark_buk_synced: {e}")
