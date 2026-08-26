from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Optional
from datetime import date, datetime

from app.core.logging_config import logger


class OvertimeRepository:
    def __init__(self, db: Session):
        self.db = db

    # ---------------------------------------------------------------- origen
    def get_workers_by_boss(self) -> List[Dict[str, Any]]:
        """Trabajadores activos con su jefe directo y el correo del jefe.

        Editar esta query para excluir cargos/áreas que no deben recibir el correo.
        """
        query = text("""
            SELECT
                e.full_name         AS employee_name,
                e.rut               AS employee_rut,
                e.name_role         AS cargo,
                a.name              AS area,
                a.second_level_name AS departamento,
                e2.rut              AS boss_rut,
                e2.full_name        AS boss_name,
                e2.email            AS boss_email
            FROM rh.employees e
            LEFT JOIN rh.employees e2 ON e.rut_boss = e2.rut
            LEFT JOIN rh.areas     a  ON e.area_id = a.id
            WHERE
                e.status = 'activo' AND
                a.second_level_name NOT IN ('Cárnica', 'Fragancias', 'Sabores') AND
                a.name NOT IN ('Control De Calidad', 'Aseguramiento De Calidad', 'Administración Gral De Producción', 'Oper. Comerciales Internacionales',
                    'Regulaciones Control Calidad', 'Tesorería', 'Rol Privado', 'Contabilidad', 
                    'Recursos Humanos', 'Informática', 'Crédito Y Cobranza', 'Control De Gestión', 'Compras Nacionales',
                    'Compras Internacionales', 'Administracion Y Finanzas Sabores') AND -- En Administración Gral De Producción hay dos operarios // En Control y Gestión de Producción hay gente. 
                e.name_role NOT IN ('Jefe de Planta', 
                    'Jefe de Medio Ambiente', 
                    'Prevención y Normas de Calidad',
                    'Líder de Prevención',
                    'Jefe de Medio Ambiente, Prevención y Normas de Calidad',
                    'Facilitador de Excelencia Operativa',
                    'Líder de Servicios Generales',
                    'Ingeniero de Expansión e Infraestructura',
                    'Jefe De Mantención',
                    'Gestor de Proyectos de Infraestructura')  AND
                e2.email IS NOT NULL AND e2.email <> ''
            ORDER BY e2.full_name, a.name, e.name_role
        """)
        try:
            rows = self.db.execute(query).mappings().all()
        except Exception as e:
            logger.error(f"Error get_workers_by_boss: {e}")
            return []

        # ponytail: rh.employees puede traer más de una fila por RUT (histórico de contratos);
        # nos quedamos con la primera para no duplicar checkboxes ni violar uq_overtime_sel.
        vistos, workers = set(), []
        for r in rows:
            if r["employee_rut"] in vistos:
                continue
            vistos.add(r["employee_rut"])
            workers.append(dict(r))
        return workers

    # -------------------------------------------------------------- requests
    def create_request(
        self,
        week_start: date,
        boss_rut: str,
        boss_name: str,
        boss_email: str,
        token: str,
        deadline: datetime,
    ) -> Optional[int]:
        """Crea o reemplaza la solicitud de la semana para un jefe. Retorna el id."""
        query = text("""
            INSERT INTO app.overtime_requests
                (week_start, boss_rut, boss_name, boss_email, response_token, deadline, sent_at)
            VALUES
                (:week_start, :boss_rut, :boss_name, :boss_email, :token, :deadline, NOW())
            ON CONFLICT (week_start, boss_rut) DO UPDATE SET
                boss_name      = EXCLUDED.boss_name,
                boss_email     = EXCLUDED.boss_email,
                response_token = EXCLUDED.response_token,
                deadline       = EXCLUDED.deadline,
                sent_at        = NOW()
            RETURNING id
        """)
        try:
            row = self.db.execute(query, {
                "week_start": week_start,
                "boss_rut": boss_rut,
                "boss_name": boss_name,
                "boss_email": boss_email,
                "token": token,
                "deadline": deadline,
            }).fetchone()
            self.db.commit()
            return row[0] if row else None
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error create_request boss_rut={boss_rut}: {e}")
            return None

    def get_by_token(self, token: str) -> Optional[Dict[str, Any]]:
        query = text("""
            SELECT id, week_start, boss_rut, boss_name, boss_email,
                   deadline, sent_at, responded_at
            FROM app.overtime_requests
            WHERE response_token = :token
        """)
        try:
            row = self.db.execute(query, {"token": token}).mappings().first()
            return dict(row) if row else None
        except Exception as e:
            logger.error(f"Error get_by_token: {e}")
            return None

    def get_selections(self, request_id: int) -> List[Dict[str, Any]]:
        query = text("""
            SELECT employee_rut, employee_name, cargo, area, sabado
            FROM app.overtime_selections
            WHERE request_id = :rid
            ORDER BY employee_name
        """)
        try:
            rows = self.db.execute(query, {"rid": request_id}).mappings().all()
            return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"Error get_selections request_id={request_id}: {e}")
            return []

    def save_selections(self, request_id: int, items: List[Dict[str, Any]], responder_ip: str = None) -> bool:
        """Reemplaza las selecciones de la solicitud (el jefe puede reeditar hasta el cierre)."""
        try:
            self.db.execute(
                text("DELETE FROM app.overtime_selections WHERE request_id = :rid"),
                {"rid": request_id},
            )
            if items:
                self.db.execute(
                    text("""
                        INSERT INTO app.overtime_selections
                            (request_id, employee_rut, employee_name, cargo, area, sabado)
                        VALUES
                            (:request_id, :employee_rut, :employee_name, :cargo, :area, :sabado)
                    """),
                    [{"request_id": request_id, **item} for item in items],
                )
            self.db.execute(
                text("""
                    UPDATE app.overtime_requests
                    SET responded_at = NOW(), responder_ip = :ip
                    WHERE id = :rid
                """),
                {"rid": request_id, "ip": responder_ip},
            )
            self.db.commit()
            return True
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error save_selections request_id={request_id}: {e}")
            return False

    # ------------------------------------------------------------ consolidado
    def get_week_summary(self, week_start: date) -> List[Dict[str, Any]]:
        """Una fila por trabajador seleccionado; los jefes sin respuesta aparecen con rut nulo."""
        query = text("""
            SELECT
                r.boss_rut, r.boss_name, r.boss_email,
                TO_CHAR(r.responded_at AT TIME ZONE 'America/Santiago', 'DD-MM-YYYY HH24:MI') AS responded_at,
                s.employee_rut, s.employee_name, s.cargo, s.area, s.sabado
            FROM app.overtime_requests r
            LEFT JOIN app.overtime_selections s ON s.request_id = r.id
            WHERE r.week_start = :week_start
            ORDER BY r.boss_name, s.employee_name
        """)
        try:
            rows = self.db.execute(query, {"week_start": week_start}).mappings().all()
            return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"Error get_week_summary {week_start}: {e}")
            return []
