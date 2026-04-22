from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any


class LicenciasRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_vigentes(self) -> List[Dict[str, Any]]:
        """Licencias vigentes (hoy entre start_date y end_date)."""
        query = text("""
            SELECT
                e.rut              AS rut_empleado,
                e.full_name        AS nombre_completo,
                ci.start_date      AS fecha_inicio,
                ci.end_date        AS fecha_fin,
                ci.type_permission AS tipo_permiso,
                ci.days_count      AS dias_duracion,
                ci.status
            FROM rh.consolidado_incidencias ci
            JOIN rh.employees e ON ci.employee_id = e.person_id
            WHERE CURRENT_DATE BETWEEN ci.start_date AND ci.end_date
            ORDER BY ci.end_date DESC
        """)
        result = self.db.execute(query)
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_por_vencer(self, dias: int = 5) -> List[Dict[str, Any]]:
        """Licencias que vencen en los próximos N días."""
        query = text("""
            SELECT
                e.rut              AS rut_empleado,
                e.full_name        AS nombre_completo,
                ci.start_date      AS fecha_inicio,
                ci.end_date        AS fecha_fin,
                ci.type_permission AS tipo_permiso,
                ci.days_count      AS dias_duracion,
                ci.status,
                (ci.end_date - CURRENT_DATE) AS dias_restantes
            FROM rh.consolidado_incidencias ci
            JOIN rh.employees e ON ci.employee_id = e.person_id
            WHERE ci.end_date >= CURRENT_DATE
              AND ci.end_date <= CURRENT_DATE + (:dias || ' days')::interval
            ORDER BY ci.end_date ASC
        """)
        result = self.db.execute(query, {"dias": dias})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_vencidas_recientes(self, dias: int = 5) -> List[Dict[str, Any]]:
        """Licencias que vencieron en los últimos N días."""
        query = text("""
            SELECT
                e.rut              AS rut_empleado,
                e.full_name        AS nombre_completo,
                ci.start_date      AS fecha_inicio,
                ci.end_date        AS fecha_fin,
                ci.type_permission AS tipo_permiso,
                ci.days_count      AS dias_duracion,
                ci.status,
                (CURRENT_DATE - ci.end_date) AS dias_vencida
            FROM rh.consolidado_incidencias ci
            JOIN rh.employees e ON ci.employee_id = e.person_id
            WHERE ci.end_date < CURRENT_DATE
              AND ci.end_date >= CURRENT_DATE - (:dias || ' days')::interval
            ORDER BY ci.end_date DESC
        """)
        result = self.db.execute(query, {"dias": dias})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_licencia_by_rut(
        self,
        rut: str,
        limit: int = 15,
        order_asc: bool = False,
    ) -> List[Dict[str, Any]]:
        """Últimas N licencias de un trabajador por RUT."""
        limit = max(1, min(100, limit))
        order_dir = "ASC" if order_asc else "DESC"
        query = text(
            f"""
            SELECT
                e.rut              AS rut_trabajador,
                e.full_name        AS nombre_trabajador,
                ci.start_date      AS fecha_inicio,
                ci.end_date        AS fecha_fin,
                ci.type_permission AS tipo_permiso,
                ci.days_count      AS dias_duracion,
                ci.status
            FROM rh.consolidado_incidencias ci
            JOIN rh.employees e ON ci.employee_id = e.person_id
            WHERE e.rut = :rut
            ORDER BY ci.end_date {order_dir}
            LIMIT :limit
            """
        )
        result = self.db.execute(query, {"rut": rut, "limit": limit})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]
