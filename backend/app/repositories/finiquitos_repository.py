from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from app.models.finiquito import Finiquito
from app.schemas.finiquitos import FiniquitoCreate

class FiniquitosRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_trabajadores_general(self) -> List[Dict[str, Any]]:
        """Obtiene la información general de los empleados vigentes"""
        query = text("""
            SELECT 
                T1.rut AS rut_trabajador,
                T1.full_name AS nombre_trabajador,
                T1.name_role AS cargo,
                T1.active_since AS fecha_ingreso,
                NULL AS fecha_salida, 
                DATEDIFF(DAY, T1.active_since, GETDATE()) / 365.0 AS duracion_empresa, 
                T1.status AS estado,
                0.0 AS sueldo_base, -- TODO: T1.base_wage está encriptado/binario. Se requiere desencriptar.
                T1.rut_boss AS rut_jefe,
                T2.full_name AS nombre_jefe,
                0 AS bonificaciones_mensuales,
                0 AS movilizacion
                FROM [dbo].[employees] AS T1
                LEFT JOIN [dbo].[employees] AS T2
                ON T1.rut_boss = T2.rut
                WHERE T1.status = 'activo'
        """)
        result = self.db.execute(query)
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_trabajadores_items(self) -> List[Dict[str, Any]]:
        """Obtiene Finiquitos y el detalle de los items mensuales por periodo"""
        query = text("""
            SELECT 
                e.rut AS rut_trabajador,
                e.full_name AS nombre_trabajador,
                e.name_role AS cargo,
                e.active_since AS fecha_ingreso,
                NULL AS fecha_salida, -- Contempla ingreso manual. Actualizar usando SET vía Python

                DATEDIFF(DAY, e.active_since, GETDATE()) / 365.0 AS duracion_empresa, 

                e.status AS estado,
                0.0 AS sueldo_base, -- TODO: e.base_wage está encriptado

                s.Periodo AS periodo,
                s.Liquidacion_ID AS liquidacion_id,
                si.income_type,
                si.name AS nombre_item,
                0.0 AS monto -- TODO: si.amount está encriptado

                
            FROM [dbo].[employees] AS e

            LEFT JOIN [dbo].[historical_settlements] AS s
            ON e.rut = s.RUT

            LEFT JOIN [dbo].[historical_settlement_items] AS si
            ON s.Liquidacion_ID = si.Liquidacion_ID

            WHERE 

            si.income_type = 'remuneracion_variable' AND
            e.status = 'activo'

            ORDER BY e.rut, RIGHT(s.Periodo, 4) DESC, LEFT(s.Periodo, 2) DESC;
        """)
        result = self.db.execute(query)
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_items_tres_meses(self) -> List[Dict[str, Any]]:
        """Obtiene Items de Sueldos de los últimos 3 meses"""
        query = text("""
            WITH DatosRankeados AS (
                SELECT 
                    e.rut AS rut_trabajador,
                    e.full_name AS nombre_trabajador,
                    s.Periodo AS periodo,
                    s.Liquidacion_ID AS liquidacion_id,
                    si.name AS concepto,
                    0.0 AS monto, -- TODO: si.amount está encriptado

                    DENSE_RANK() OVER (
                        PARTITION BY e.rut 
                        ORDER BY RIGHT(s.Periodo, 4) DESC, LEFT(s.Periodo, 2) DESC
                    ) AS RankingPeriodo

                FROM [dbo].[employees] AS e
                LEFT JOIN [dbo].[historical_settlements] AS s ON e.rut = s.RUT
                LEFT JOIN [dbo].[historical_settlement_items] AS si ON s.Liquidacion_ID = si.Liquidacion_ID

                WHERE 
                    e.status = 'activo' AND
                    si.income_type = 'remuneracion_variable'
            )

            SELECT 
                rut_trabajador,
                nombre_trabajador,
                periodo,
                liquidacion_id,
                concepto,
                monto
            FROM DatosRankeados
            WHERE RankingPeriodo <= 3 -- Nos quedamos solo con los periodos 1, 2 y 3
            ORDER BY 
                RankingPeriodo ASC;
        """)
        result = self.db.execute(query)
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_items_by_rut(self, rut: str) -> List[Finiquito]:
        return self.db.query(Finiquito).filter(Finiquito.rut_trabajador == rut).all()