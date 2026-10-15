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
        Retorna el response_token opaco como string.
        """
        from app.core.security import create_response_token

        # Token aleatorio, sin datos del empleado dentro. Se rota en cada envío
        # (también en los recordatorios), así que el link viejo deja de servir.
        new_token = create_response_token()

        query = text("""
            INSERT INTO app.contract_alert_tracking (
                employee_id, rut, employee_name, employee_role,
                boss_name, boss_email, alert_date, alert_type, alert_reason,
                response_token, token_issued_at, first_sent_at, last_followup_at, updated_at
            )
            VALUES (
                :employee_id, :rut, :employee_name, :employee_role,
                :boss_name, :boss_email, :alert_date, :alert_type, :alert_reason,
                :response_token, NOW(), NOW(), NOW(), NOW()
            )
            ON CONFLICT (employee_id, alert_date)
            DO UPDATE SET
                last_followup_at = NOW(),
                followup_count   = app.contract_alert_tracking.followup_count + 1,
                boss_name        = EXCLUDED.boss_name,
                boss_email       = EXCLUDED.boss_email,
                alert_type       = EXCLUDED.alert_type,
                alert_reason     = EXCLUDED.alert_reason,
                response_token   = EXCLUDED.response_token,
                token_issued_at  = NOW(),
                updated_at       = NOW()
            RETURNING response_token
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
                "response_token": new_token,
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
                response_token,
                token_issued_at,
                first_sent_at, last_followup_at, response, responded_at,
                buk_synced
            FROM app.contract_alert_tracking
            WHERE response_token = :token
        """)
        try:
            result = self.db.execute(query, {"token": token})
            columns = result.keys()
            row = result.fetchone()
            return dict(zip(columns, row)) if row else None
        except Exception as e:
            logger.error(f"Error get_by_token {token}: {e}")
            return None

    def set_response(self, token: str, response: str, responder_ip: str = None) -> bool:
        query = text("""
            UPDATE app.contract_alert_tracking
            SET response = :response, responded_at = NOW(), updated_at = NOW(),
                responder_ip = :responder_ip
            WHERE response_token = :token
              AND response IS NULL
        """)
        try:
            result = self.db.execute(
                query, {"token": token, "response": response, "responder_ip": responder_ip}
            )
            self.db.commit()
            # 0 filas = otro request ganó la carrera y ya dejó una respuesta.
            # El WHERE response IS NULL es lo que hace el consumo único.
            return result.rowcount == 1
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error set_response: {e}")
            return False

    def get_all_tracking(self) -> List[Dict[str, Any]]:
        query = text("""
            SELECT
                t.id,
                t.employee_id,
                t.rut,
                t.employee_name,
                t.employee_role,
                t.boss_name,
                t.boss_email,
                TO_CHAR(t.alert_date, 'DD-MM-YYYY') AS alert_date,
                TO_CHAR(e.active_since, 'DD-MM-YYYY') AS employee_start_date,
                t.alert_type,
                t.alert_reason,
                t.response_token::text AS response_token,
                TO_CHAR(t.first_sent_at AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI') AS first_sent_at,
                TO_CHAR(t.last_followup_at AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI') AS last_followup_at,
                t.followup_count,
                t.response,
                TO_CHAR(t.responded_at AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI') AS responded_at,
                t.buk_synced,
                TO_CHAR(t.buk_synced_at AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI') AS buk_synced_at,
                t.buk_sync_error
            FROM app.contract_alert_tracking t
            LEFT JOIN rh.employees e ON e.rut = t.rut
            ORDER BY t.alert_date ASC, t.employee_name ASC
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

    def rotate_token(self, tracking_id: int) -> Optional[str]:
        """Emite un token nuevo para la fila y lo retorna. None si falla.

        El link anterior deja de resolver apenas corre este UPDATE: response_token
        es el único camino hasta la fila. No mueve token_issued_at: la ventana de
        vigencia la abre mark_followup_sent() una vez que el correo salió de
        verdad, así un envío fallido no regala 72 horas a un token que nadie recibió.
        """
        from app.core.security import create_response_token

        query = text("""
            UPDATE app.contract_alert_tracking
            SET response_token = :token,
                updated_at     = NOW()
            WHERE id = :tracking_id
            RETURNING response_token::text
        """)
        try:
            result = self.db.execute(query, {
                "token": create_response_token(),
                "tracking_id": tracking_id,
            })
            row = result.fetchone()
            self.db.commit()
            return row[0] if row else None
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error rotate_token tracking_id={tracking_id}: {e}")
            return None

    def mark_followup_sent(self, tracking_id: int) -> None:
        """Abre la ventana de vigencia del token recién emitido y cuenta el envío.

        Deja last_followup_at quieto a propósito: esa fecha marca la cadencia en
        get_pending_followups(), y moverla convertiría el recordatorio diario en
        uno cada tres días. La vigencia del link es asunto de token_issued_at.
        """
        query = text("""
            UPDATE app.contract_alert_tracking
            SET token_issued_at = NOW(),
                followup_count  = followup_count + 1,
                updated_at      = NOW()
            WHERE id = :tracking_id
        """)
        try:
            self.db.execute(query, {"tracking_id": tracking_id})
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error mark_followup_sent tracking_id={tracking_id}: {e}")

    def log_event(
        self,
        tracking_id: int,
        event_type: str,
        answer: Optional[str] = None,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        query = text("""
            INSERT INTO app.contract_alert_events (tracking_id, event_type, answer, ip, user_agent)
            VALUES (:tracking_id, :event_type, :answer, :ip, :user_agent)
        """)
        try:
            self.db.execute(query, {
                "tracking_id": tracking_id,
                "event_type": event_type,
                "answer": answer,
                "ip": ip,
                "user_agent": user_agent,
            })
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error log_event tracking_id={tracking_id} event={event_type}: {e}")

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
