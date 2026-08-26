-- migrations/016_create_costos_peru_views.sql
-- Costos Perú: mismas vistas analíticas que Chile, sobre rh_peru.
--
-- Diferencias con Chile, todas deliberadas:
--   * Vistas normales, no materializadas: la fuente filtrada son ~17.600 filas
--     (Chile: 330.000). No hay REFRESH que agregar al ETL y el mes aparece solo
--     en cuanto la liquidación queda cerrada.
--   * Sólo liquidaciones cerradas (rh_peru.historical_settlements.cerrada).
--   * Se une por document_number: 26 de 2.507 liquidaciones traen un employee_id
--     que no existe en rh_peru.employees.
--   * Las columnas se llaman igual que en Chile (rut, rut_boss) para que el
--     repositorio sólo cambie el origen y no el SQL. En Perú transportan el DNI.

CREATE SCHEMA IF NOT EXISTS costos;

-- Documentos de prueba dentro de rh_peru (Cramer Chile SAC, 92 PEN históricos).
-- Se excluyen de costos, catálogos y jerarquía.


-- =============================================================
-- 1. Vista principal de costos Perú.
-- =============================================================
DROP VIEW IF EXISTS costos.v_costos_colaboradores_peru CASCADE;

CREATE VIEW costos.v_costos_colaboradores_peru AS
SELECT
    -- Período
    hs.pay_period,
    hs.anio,
    hs.mes,
    -- Empleado (rut = DNI/documento)
    hs.document_number            AS rut,
    e.id                          AS employee_id,
    e.full_name,
    e.name_role                   AS cargo,
    e.contract_type,
    e.status                      AS employee_status,
    e.base_wage,
    -- Jefatura
    e.dni_boss                    AS rut_boss,
    jefe.full_name                AS jefatura_nombre,
    jefe.name_role                AS jefatura_cargo,
    -- Estructura organizacional
    a.id                          AS area_id,
    a.first_level_name            AS empresa,
    a.name                        AS area,
    a.second_level_name           AS subarea,
    a.cost_center                 AS centro_costo,
    COALESCE(e.cost_center, a.cost_center) AS centro_costo_efectivo,
    -- Detalle del costo
    hsi.item_type,
    -- Los ítems APORTE llegan sin income_type; se etiquetan para que el filtro
    -- por tipo de ingreso no esconda EsSalud, EPS, SCTR y Vida Ley.
    CASE WHEN upper(trim(hsi.item_type)) = 'APORTE'
         THEN 'aporte_patronal'
         ELSE hsi.income_type
    END                           AS income_type,
    hsi.subtype,
    -- Normaliza grafías duplicadas: 'Eps'/'EPS', 'Trabajo en sobretiempo 25%'/'... En ...'.
    initcap(trim(hsi.name))       AS concepto,
    hsi.amount,
    hsi.imponible,
    hsi.taxable
FROM rh_peru.historical_settlements hs
JOIN rh_peru.historical_settlement_items hsi ON hsi.liquidacion_id = hs.liquidacion_id
JOIN rh_peru.employees e          ON e.document_number = hs.document_number
LEFT JOIN rh_peru.areas a         ON a.id = e.area_id
LEFT JOIN rh_peru.employees jefe  ON jefe.document_number = e.dni_boss
WHERE hs.cerrada IS TRUE
  AND upper(trim(hsi.item_type)) NOT IN ('DESCUENTO', 'INFORMATIVO')
  AND e.document_number NOT IN ('00000000', '11111111');


-- =============================================================
-- 2. Jerarquía recursiva de jefaturas Perú (cap 10 niveles).
--    La guarda e.document_number <> c.descendiente_rut evita expandir a las
--    personas que figuran como jefe de sí mismas.
-- =============================================================
DROP VIEW IF EXISTS costos.v_jerarquia_jefatura_peru CASCADE;

CREATE VIEW costos.v_jerarquia_jefatura_peru AS
WITH RECURSIVE cadena AS (
    SELECT document_number AS jefe_rut, document_number AS descendiente_rut, 0 AS nivel
    FROM rh_peru.employees
    WHERE status = 'activo'
      AND document_number IS NOT NULL
      AND document_number NOT IN ('00000000', '11111111')
    UNION ALL
    SELECT c.jefe_rut, e.document_number, c.nivel + 1
    FROM cadena c
    JOIN rh_peru.employees e ON e.dni_boss = c.descendiente_rut
    WHERE e.status = 'activo'
      AND e.document_number <> c.descendiente_rut
      AND e.document_number NOT IN ('00000000', '11111111')
      AND c.nivel < 10
)
SELECT jefe_rut, descendiente_rut, MIN(nivel) AS nivel
FROM cadena
GROUP BY jefe_rut, descendiente_rut;


-- =============================================================
-- 3. Dimensiones Perú (catálogo para selectores en cascada).
-- =============================================================
CREATE OR REPLACE VIEW costos.v_dimensiones_peru AS
SELECT DISTINCT
    a.first_level_name                          AS empresa,
    a.name                                      AS area,
    a.second_level_name                         AS subarea,
    COALESCE(e.cost_center, a.cost_center)      AS centro_costo,
    e.name_role                                 AS cargo
FROM rh_peru.employees e
LEFT JOIN rh_peru.areas a ON a.id = e.area_id
WHERE e.status = 'activo'
  AND e.document_number NOT IN ('00000000', '11111111');


-- =============================================================
-- 4. Personas para autocomplete. Un contrato por país: el repositorio
--    consulta la misma forma en ambos.
-- =============================================================
CREATE OR REPLACE VIEW costos.v_personas_chile AS
SELECT
    e.rut,
    e.full_name,
    e.name_role        AS cargo,
    a.first_level_name AS empresa,
    a.name             AS area
FROM rh.employees e
LEFT JOIN rh.areas a ON a.id = e.area_id
WHERE e.status = 'activo';

CREATE OR REPLACE VIEW costos.v_personas_peru AS
SELECT
    e.document_number  AS rut,
    e.full_name,
    e.name_role        AS cargo,
    a.first_level_name AS empresa,
    a.name             AS area
FROM rh_peru.employees e
LEFT JOIN rh_peru.areas a ON a.id = e.area_id
WHERE e.status = 'activo'
  AND e.document_number NOT IN ('00000000', '11111111');


-- =============================================================
-- 5. Jefes por país (empleados con al menos un subordinado activo distinto
--    de sí mismos). Reemplaza el SQL inline duplicado del repositorio.
-- =============================================================
-- DROP + CREATE, no REPLACE: la vista existente no tiene la columna subarea.
DROP VIEW IF EXISTS costos.v_jefes CASCADE;

CREATE VIEW costos.v_jefes AS
SELECT
    e.rut,
    e.full_name,
    e.name_role,
    a.first_level_name  AS empresa,
    a.name              AS area,
    a.second_level_name AS subarea,
    sub_count.subordinados_directos
FROM rh.employees e
LEFT JOIN rh.areas a ON a.id = e.area_id
JOIN (
    SELECT rut_boss, COUNT(*) AS subordinados_directos
    FROM rh.employees
    WHERE status = 'activo' AND rut_boss IS NOT NULL AND rut_boss <> rut
    GROUP BY rut_boss
) sub_count ON sub_count.rut_boss = e.rut
WHERE e.status = 'activo';

CREATE OR REPLACE VIEW costos.v_jefes_peru AS
SELECT
    e.document_number   AS rut,
    e.full_name,
    e.name_role,
    a.first_level_name  AS empresa,
    a.name              AS area,
    a.second_level_name AS subarea,
    sub_count.subordinados_directos
FROM rh_peru.employees e
LEFT JOIN rh_peru.areas a ON a.id = e.area_id
JOIN (
    SELECT dni_boss, COUNT(*) AS subordinados_directos
    FROM rh_peru.employees
    WHERE status = 'activo'
      AND dni_boss IS NOT NULL
      AND dni_boss <> document_number
      AND document_number NOT IN ('00000000', '11111111')
    GROUP BY dni_boss
) sub_count ON sub_count.dni_boss = e.document_number
WHERE e.status = 'activo'
  AND e.document_number NOT IN ('00000000', '11111111');


-- =============================================================
-- 6. Chile: misma guarda de auto-jefatura en la MV de jerarquía.
--    180 personas tienen rut_boss = rut y hacían expandir la recursión 10
--    veces. El resultado agregado no cambia (MIN(nivel) ya deduplicaba).
-- =============================================================
DROP MATERIALIZED VIEW IF EXISTS costos.mv_jerarquia_jefatura CASCADE;

CREATE MATERIALIZED VIEW costos.mv_jerarquia_jefatura AS
WITH RECURSIVE cadena AS (
    SELECT rut AS jefe_rut, rut AS descendiente_rut, 0 AS nivel
    FROM rh.employees
    WHERE status = 'activo' AND rut IS NOT NULL
    UNION ALL
    SELECT c.jefe_rut, e.rut, c.nivel + 1
    FROM cadena c
    JOIN rh.employees e ON e.rut_boss = c.descendiente_rut
    WHERE e.status = 'activo'
      AND e.rut <> c.descendiente_rut
      AND c.nivel < 10
)
SELECT jefe_rut, descendiente_rut, MIN(nivel) AS nivel
FROM cadena
GROUP BY jefe_rut, descendiente_rut;

CREATE INDEX IF NOT EXISTS idx_jerarquia_jefe ON costos.mv_jerarquia_jefatura (jefe_rut);
CREATE INDEX IF NOT EXISTS idx_jerarquia_desc ON costos.mv_jerarquia_jefatura (descendiente_rut);


-- =============================================================
-- Validaciones manuales post-migración:
--   SELECT COUNT(*) FROM costos.v_costos_colaboradores_peru;                        -- ~17.600
--   SELECT MAX(pay_period) FROM costos.v_costos_colaboradores_peru;                 -- 2026-06-01
--   SELECT DISTINCT upper(trim(item_type)) FROM costos.v_costos_colaboradores_peru; -- HABER, APORTE
--   SELECT round(SUM(amount)) FROM costos.v_costos_colaboradores_peru
--    WHERE pay_period = DATE '2026-06-01';                                          -- 557673
--   SELECT COUNT(*) FROM costos.v_jefes_peru;                                       -- 14
-- =============================================================
