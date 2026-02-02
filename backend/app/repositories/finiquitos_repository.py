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

    def get_item_by_rut(self, rut: str) -> List[Finiquito]:
        """Obtiene Finiquitos y el detalle de los items mensuales por periodo"""
        query = text("""
            WITH DatosRankeados AS (
                SELECT 
                    e.full_name AS nombre_trabajador,
                    e.rut AS rut_trabajador,
                    e.name_role AS cargo,
                    e.status,
                    e.active_since AS fecha_ingreso,
                    e.area_id AS cod_area,
                    a.second_level_name AS nombre_area, 
                    s.Periodo AS periodo,
                    s.Liquidacion_ID AS liquidacion_id,
                    si.name AS concepto,
                    si.income_type,
                    si.amount AS monto, -- TODO: si.amount está encriptado

                DENSE_RANK() OVER (
                        PARTITION BY e.rut 
                        ORDER BY RIGHT(s.Periodo, 4) DESC, LEFT(s.Periodo, 2) DESC
                        ) AS RankingPeriodo

                FROM [dbo].[employees] AS e
                LEFT JOIN [dbo].[historical_settlements] AS s ON e.rut = s.RUT
                LEFT JOIN [dbo].[historical_settlement_items] AS si ON s.Liquidacion_ID = si.Liquidacion_ID
                LEFT JOIN [dbo].[areas] AS a ON a.id = e.area_id
            
                WHERE 
                e.status = 'activo'
                )

            SELECT 
                nombre_trabajador,
                rut_trabajador,
                cargo,
                fecha_ingreso,
                periodo,
                status,
                cod_area,
                nombre_area,
                liquidacion_id,
                income_type,
                concepto,
                monto
            FROM DatosRankeados
            WHERE RankingPeriodo <= 5
            AND rut_trabajador = :rut
            ORDER BY 
            RankingPeriodo ASC, nombre_trabajador;
        """)
        result = self.db.execute(query, {"rut": rut})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_descuentos_by_rut(self, rut: str) -> List[Finiquito]:
        """Obtiene los descuentos de finiquito filtrados por concepto"""
        query = text("""
            WITH DatosRankeados AS (
                SELECT 
                    e.full_name AS nombre_trabajador,
                    e.rut AS rut_trabajador,
                    e.name_role AS cargo,
                    e.status,
                    e.active_since AS fecha_ingreso,
                    e.area_id AS cod_area,
                    a.second_level_name AS nombre_area, 
                    s.Periodo AS periodo,
                    s.Liquidacion_ID AS liquidacion_id,
                    si.name AS concepto,
                    si.income_type,
                    si.amount AS monto,

                DENSE_RANK() OVER (
                        PARTITION BY e.rut 
                        ORDER BY RIGHT(s.Periodo, 4) DESC, LEFT(s.Periodo, 2) DESC
                        ) AS RankingPeriodo

                FROM [dbo].[employees] AS e
                LEFT JOIN [dbo].[historical_settlements] AS s ON e.rut = s.RUT
                LEFT JOIN [dbo].[historical_settlement_items] AS si ON s.Liquidacion_ID = si.Liquidacion_ID
                LEFT JOIN [dbo].[areas] AS a ON a.id = e.area_id
            
                WHERE 
                e.status = 'activo'
                AND si.name IN ('Prestamo Interno', 'Descuento Por Planilla')
                )

            SELECT 
                nombre_trabajador,
                rut_trabajador,
                cargo,
                fecha_ingreso,
                periodo,
                status,
                cod_area,
                nombre_area,
                liquidacion_id,
                income_type,
                concepto,
                monto
            FROM DatosRankeados
            WHERE RankingPeriodo <= 5
            AND rut_trabajador = :rut
            ORDER BY 
            RankingPeriodo ASC, concepto;
        """)
        result = self.db.execute(query, {"rut": rut})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    # def get_item_variable_by_rut(self, rut: str, variable: str) -> List[Finiquito]:
    #     """Obtiene Finiquitos y el detalle de los items mensuales por periodo filtrado por variable"""
    #     query = text("""
    #         WITH DatosRankeados AS (
    #             SELECT 
    #                 e.full_name AS nombre_trabajador,
    #                 e.rut AS rut_trabajador,
    #                 e.name_role AS cargo,
    #                 e.status,
    #                 e.active_since AS fecha_ingreso,
    #                 e.area_id AS cod_area,
    #                 a.second_level_name AS nombre_area, 
    #                 s.Periodo AS periodo,
    #                 s.Liquidacion_ID AS liquidacion_id,
    #                 si.name AS concepto,
    #                 0.0 AS monto, -- TODO: si.amount está encriptado

    #             DENSE_RANK() OVER (
    #                     PARTITION BY e.rut 
    #                     ORDER BY RIGHT(s.Periodo, 4) DESC, LEFT(s.Periodo, 2) DESC
    #                     ) AS RankingPeriodo

    #             FROM [dbo].[employees] AS e
    #             LEFT JOIN [dbo].[historical_settlements] AS s ON e.rut = s.RUT
    #             LEFT JOIN [dbo].[historical_settlement_items] AS si ON s.Liquidacion_ID = si.Liquidacion_ID
    #             LEFT JOIN [dbo].[areas] AS a ON a.id = e.area_id
            
    #             WHERE 
    #             e.status = 'activo' AND
    #             (:variable = '0' OR si.income_type = :variable)
    #             )

    #         SELECT 
    #             nombre_trabajador,
    #             rut_trabajador,
    #             cargo,
    #             fecha_ingreso,
    #             periodo,
    #             status,
    #             cod_area,
    #             nombre_area,
    #             liquidacion_id,
    #             concepto,
    #             monto
    #         FROM DatosRankeados
    #         WHERE RankingPeriodo <= 5 AND
    #         rut_trabajador = :rut
    #         ORDER BY 
    #         RankingPeriodo ASC, nombre_trabajador;
    #     """)
    #     result = self.db.execute(query, {"rut": rut, "variable": variable})
    #     columns = result.keys()
    #     return [dict(zip(columns, row)) for row in result.fetchall()]