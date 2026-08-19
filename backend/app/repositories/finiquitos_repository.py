from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any


class FiniquitosRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_trabajadores_general(self) -> List[Dict[str, Any]]:
        """Información general de empleados activos (un registro por RUT, el más reciente)."""
        query = text("""
            SELECT DISTINCT ON (e.rut)
                e.rut          AS rut_trabajador,
                e.full_name    AS nombre_trabajador,
                e.name_role    AS cargo,
                e.active_since AS fecha_ingreso,
                NULL::date     AS fecha_salida,
                ROUND(
                    (CURRENT_DATE - e.active_since)::numeric / 365.25,
                    2
                )::float       AS duracion_empresa,
                e.status       AS estado,
                e.base_wage    AS sueldo_base,
                e.rut_boss     AS rut_jefe,
                boss.full_name AS nombre_jefe,
                a.second_level_name AS departamento,
                a.first_level_name  AS nombre_empresa,
                0              AS bonificaciones_mensuales,
                0              AS movilizacion
            FROM rh.employees AS e
            LEFT JOIN rh.employees AS boss ON e.rut_boss = boss.rut
            LEFT JOIN rh.areas      AS a    ON a.id = e.area_id
            ORDER BY e.rut, e.active_since DESC NULLS LAST
        """)
        result = self.db.execute(query)
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_item_by_rut(self, rut: str, limit: int = 15) -> List[Dict[str, Any]]:
        """Items de liquidación por RUT, últimos N períodos."""
        limit = max(1, min(60, limit))
        query = text("""
            WITH datos_rankeados AS (
                SELECT
                    e.full_name        AS nombre_trabajador,
                    e.rut              AS rut_trabajador,
                    e.name_role        AS cargo,
                    boss.full_name     AS nombre_jefe,
                    e.status,
                    e.address          AS direccion,
                    e.district         AS comuna,
                    e.active_since     AS fecha_ingreso,
                    e.birthday         AS fecha_nacimiento,
                    e.area_id          AS cod_area,
                    a.first_level_name  AS nombre_empresa,
                    a.second_level_name AS nombre_area,
                    s.periodo,
                    s.liquidacion_id,
                    si.name            AS concepto,
                    si.income_type,
                    si.amount          AS monto,
                    DENSE_RANK() OVER (
                        PARTITION BY e.rut
                        ORDER BY RIGHT(s.periodo, 4) DESC, LEFT(s.periodo, 2) DESC
                    ) AS ranking_periodo
                FROM rh.employees AS e
                LEFT JOIN rh.historical_settlements AS s
                    ON e.rut = s.rut
                LEFT JOIN rh.historical_settlement_items AS si
                    ON s.liquidacion_id = si.liquidacion_id
                    AND si.income_type IN (
                        'remuneracion_ocasional',
                        'remuneracion_fija',
                        'remuneracion_variable'
                    )
                LEFT JOIN rh.areas AS a
                    ON a.id = e.area_id
                LEFT JOIN rh.employees AS boss
                    ON e.rut_boss = boss.rut
                WHERE
                    e.rut = :rut
            )
            SELECT
                nombre_trabajador,
                rut_trabajador,
                cargo,
                nombre_jefe,
                direccion,
                comuna,
                fecha_ingreso,
                fecha_nacimiento,
                periodo,
                status,
                cod_area,
                nombre_empresa,
                nombre_area,
                liquidacion_id,
                income_type,
                concepto,
                monto
            FROM datos_rankeados
            WHERE ranking_periodo <= :limit
            ORDER BY ranking_periodo ASC, nombre_trabajador
        """)
        result = self.db.execute(query, {"rut": rut, "limit": limit})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_descuentos_by_rut(self, rut: str) -> List[Dict[str, Any]]:
        """Descuentos de los últimos 5 períodos para un trabajador."""
        query = text("""
            WITH datos_rankeados AS (
                SELECT
                    e.full_name         AS nombre_trabajador,
                    e.rut               AS rut_trabajador,
                    e.name_role         AS cargo,
                    e.status,
                    e.active_since      AS fecha_ingreso,
                    e.area_id           AS cod_area,
                    a.second_level_name AS nombre_area,
                    s.periodo,
                    s.liquidacion_id,
                    si.name             AS concepto,
                    si.income_type,
                    si.amount           AS monto,
                    DENSE_RANK() OVER (
                        PARTITION BY e.rut
                        ORDER BY RIGHT(s.periodo, 4) DESC, LEFT(s.periodo, 2) DESC
                    ) AS ranking_periodo
                FROM rh.employees AS e
                LEFT JOIN rh.historical_settlements AS s
                    ON e.rut = s.rut
                LEFT JOIN rh.historical_settlement_items AS si
                    ON s.liquidacion_id = si.liquidacion_id
                LEFT JOIN rh.areas AS a
                    ON a.id = e.area_id
                WHERE
                    e.rut = :rut
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
            FROM datos_rankeados
            WHERE ranking_periodo <= 5
            ORDER BY ranking_periodo ASC, concepto
        """)
        result = self.db.execute(query, {"rut": rut})
        columns = result.keys()
        return [dict(zip(columns, row)) for row in result.fetchall()]
