from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from app.models.licencias import Licencia
from app.schemas.licencias import LicenciaCreate

class LicenciasRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_vigentes(self) -> List[Dict[str, Any]]:
        """Obtiene las licencias vigentes (fecha actual entre fecha_inicio y fecha_fin)"""
        query = text("""
            SELECT 
                rut_empleado,
                nombre_completo,
                fecha_inicio,
                fecha_fin,
                tipo_permiso,
                dias_duracion,
                status
            FROM [IARRHH].[dbo].[consolidado_incidencias]
            WHERE CAST(GETDATE() AS DATE) BETWEEN fecha_inicio AND fecha_fin
            ORDER BY fecha_fin DESC
        """)
        result = self.db.execute(query)
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_por_vencer(self, dias: int = 5) -> List[Dict[str, Any]]:
        """Obtiene licencias que vencen en los próximos N días"""
        query = text("""
            SELECT 
                rut_empleado,
                nombre_completo,
                fecha_inicio,
                fecha_fin,
                tipo_permiso,
                dias_duracion,
                status,
                DATEDIFF(DAY, CAST(GETDATE() AS DATE), fecha_fin) as dias_restantes
            FROM [IARRHH].[dbo].[consolidado_incidencias]
            WHERE fecha_fin >= CAST(GETDATE() AS DATE)
              AND fecha_fin <= DATEADD(DAY, :dias, CAST(GETDATE() AS DATE))
            ORDER BY fecha_fin ASC
        """)
        result = self.db.execute(query, {"dias": dias})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_vencidas_recientes(self, dias: int = 5) -> List[Dict[str, Any]]:
        """Obtiene licencias que vencieron en los últimos N días"""
        query = text("""
            SELECT 
                rut_empleado,
                nombre_completo,
                fecha_inicio,
                fecha_fin,
                tipo_permiso,
                dias_duracion,
                status,
                DATEDIFF(DAY, fecha_fin, CAST(GETDATE() AS DATE)) as dias_vencida
            FROM [IARRHH].[dbo].[consolidado_incidencias]
            WHERE fecha_fin < CAST(GETDATE() AS DATE)
              AND fecha_fin >= DATEADD(DAY, -:dias, CAST(GETDATE() AS DATE))
            ORDER BY fecha_fin DESC
        """)
        result = self.db.execute(query, {"dias": dias})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_licencia_by_rut(self, rut: str) -> List[Licencia]:
        """Obtiene las últimas 5 licencias con filtro de rut"""
        query = text("""
            SELECT TOP 5 
                rut_empleado AS rut_trabajador,
                nombre_completo AS nombre_trabajador,
                fecha_inicio,
                fecha_fin,
                tipo_permiso,
                dias_duracion,
                status
            FROM [IARRHH].[dbo].[consolidado_incidencias]
            WHERE rut_empleado = :rut
            ORDER BY fecha_fin DESC
                    """)
        result = self.db.execute(query, {"rut": rut})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    # def get_all(self, skip: int = 0, limit: int = 100) -> List[Licencia]:
    #     # MSSQL requiere ORDER BY cuando se usa OFFSET/LIMIT
    #     return self.db.query(Licencia).order_by(Licencia.id).offset(skip).limit(limit).all()

    # def get_by_id(self, licencia_id: int) -> Optional[Licencia]:
    #     return self.db.query(Licencia).filter(Licencia.id == licencia_id).first()

        
    # def create(self, licencia: LicenciaCreate) -> Licencia:
    #     db_licencia = Licencia(**licencia.model_dump())
    #     self.db.add(db_licencia)
    #     self.db.commit()
    #     self.db.refresh(db_licencia)
    #     return db_licencia