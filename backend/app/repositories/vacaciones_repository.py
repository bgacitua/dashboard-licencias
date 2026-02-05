from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from app.models.vacaciones import Vacacion
from app.schemas.vacaciones import VacacionBase

class VacacionesRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_vacaciones_vigentes(self) -> List[VacacionBase]:
        """Obtiene las vacaciones vigentes"""
        query = text("""
            SELECT 
                vc.[employee_id],
                e.[full_name],
                e.[rut],
                vc.[working_days],
                vc.[calendar_days],
                vc.[workday_stage],
                vc.[type],
                vc.[status],
                vc.[start_date],
                vc.[end_date]
            FROM [IARRHH].[dbo].[vacations] as vc

            INNER JOIN [dbo].[employees] as e
            ON vc.[employee_id] = e.[person_id]

            WHERE GETDATE() BETWEEN vc.start_date and vc.end_date
        """)
        result = self.db.execute(query)
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]
