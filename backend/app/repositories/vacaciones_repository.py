from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any


class VacacionesRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_vacaciones_vigentes(self) -> List[Dict[str, Any]]:
        """Vacaciones vigentes (hoy entre start_date y end_date)."""
        query = text("""
            SELECT
                vc.employee_id,
                e.full_name,
                e.rut,
                vc.working_days,
                NULL::integer AS calendar_days,
                vc.workday_stage,
                vc.type,
                vc.status,
                vc.start_date,
                vc.end_date
            FROM rh.vacations AS vc
            INNER JOIN rh.employees AS e ON vc.employee_id = e.person_id
            WHERE NOW() BETWEEN vc.start_date AND vc.end_date
        """)
        result = self.db.execute(query)
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]
