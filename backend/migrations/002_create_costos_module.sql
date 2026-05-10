-- migrations/002_create_costos_module.sql
-- Módulo "Costos por Área" — vistas materializadas y catálogos.
-- Todo en schema costos para no tocar el territorio del ETL en rh.*.

CREATE SCHEMA IF NOT EXISTS costos;

-- =============================================================
-- 1. MV principal: línea-detalle enriquecida con dimensiones.
--    Excluye DESCUENTO e INFORMATIVO según la regla de negocio.
-- =============================================================
DROP MATERIALIZED VIEW IF EXISTS costos.mv_costos_colaboradores CASCADE;

CREATE MATERIALIZED VIEW costos.mv_costos_colaboradores AS
SELECT
    -- Período
    hs.pay_period,
    hs.anio,
    hs.mes,
    -- Empleado
    hs.rut,
    e.id                          AS employee_id,
    e.full_name,
    e.name_role                   AS cargo,
    e.contract_type,
    e.status                      AS employee_status,
    e.base_wage,
    -- Jefatura
    e.rut_boss,
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
    hsi.income_type,
    hsi.subtype,
    hsi.name                      AS concepto,
    hsi.amount,
    hsi.imponible,
    hsi.taxable
FROM rh.historical_settlements hs
JOIN rh.historical_settlement_items hsi ON hsi.liquidacion_id = hs.liquidacion_id
JOIN rh.employees e               ON e.id = hs.employee_id
LEFT JOIN rh.areas a              ON a.id = e.area_id
LEFT JOIN rh.employees jefe       ON jefe.rut = e.rut_boss
WHERE upper(trim(hsi.item_type)) NOT IN ('DESCUENTO', 'INFORMATIVO');

CREATE INDEX IF NOT EXISTS idx_mv_costos_pay_period ON costos.mv_costos_colaboradores (pay_period);
CREATE INDEX IF NOT EXISTS idx_mv_costos_anio_mes   ON costos.mv_costos_colaboradores (anio, mes);
CREATE INDEX IF NOT EXISTS idx_mv_costos_empresa    ON costos.mv_costos_colaboradores (empresa);
CREATE INDEX IF NOT EXISTS idx_mv_costos_area       ON costos.mv_costos_colaboradores (area);
CREATE INDEX IF NOT EXISTS idx_mv_costos_cc         ON costos.mv_costos_colaboradores (centro_costo_efectivo);
CREATE INDEX IF NOT EXISTS idx_mv_costos_rut        ON costos.mv_costos_colaboradores (rut);
CREATE INDEX IF NOT EXISTS idx_mv_costos_jefatura   ON costos.mv_costos_colaboradores (rut_boss);
CREATE INDEX IF NOT EXISTS idx_mv_costos_cargo      ON costos.mv_costos_colaboradores (cargo);
CREATE INDEX IF NOT EXISTS idx_mv_costos_income     ON costos.mv_costos_colaboradores (income_type);


-- =============================================================
-- 2. MV de jerarquía recursiva de jefaturas.
--    Para cada jefe_rut entrega TODOS sus descendientes (cap 10 niveles).
-- =============================================================
DROP MATERIALIZED VIEW IF EXISTS costos.mv_jerarquia_jefatura CASCADE;

CREATE MATERIALIZED VIEW costos.mv_jerarquia_jefatura AS
WITH RECURSIVE cadena AS (
    -- nivel 0: el jefe se incluye a sí mismo
    SELECT rut AS jefe_rut, rut AS descendiente_rut, 0 AS nivel
    FROM rh.employees
    WHERE status = 'activo' AND rut IS NOT NULL
    UNION ALL
    SELECT c.jefe_rut, e.rut, c.nivel + 1
    FROM cadena c
    JOIN rh.employees e ON e.rut_boss = c.descendiente_rut
    WHERE e.status = 'activo' AND c.nivel < 10
)
SELECT jefe_rut, descendiente_rut, MIN(nivel) AS nivel
FROM cadena
GROUP BY jefe_rut, descendiente_rut;

CREATE INDEX IF NOT EXISTS idx_jerarquia_jefe ON costos.mv_jerarquia_jefatura (jefe_rut);
CREATE INDEX IF NOT EXISTS idx_jerarquia_desc ON costos.mv_jerarquia_jefatura (descendiente_rut);


-- =============================================================
-- 3. Vista de dimensiones (catálogo para selectores en cascada).
-- =============================================================
CREATE OR REPLACE VIEW costos.v_dimensiones AS
SELECT DISTINCT
    a.first_level_name                          AS empresa,
    a.name                                      AS area,
    a.second_level_name                         AS subarea,
    COALESCE(e.cost_center, a.cost_center)      AS centro_costo,
    e.name_role                                 AS cargo
FROM rh.employees e
LEFT JOIN rh.areas a ON a.id = e.area_id
WHERE e.status = 'activo';


-- =============================================================
-- 4. Vista de jefes (empleados con al menos un subordinado activo).
-- =============================================================
CREATE OR REPLACE VIEW costos.v_jefes AS
SELECT
    e.rut,
    e.full_name,
    e.name_role,
    a.first_level_name AS empresa,
    a.name             AS area,
    sub_count.subordinados_directos
FROM rh.employees e
LEFT JOIN rh.areas a ON a.id = e.area_id
JOIN (
    SELECT rut_boss, COUNT(*) AS subordinados_directos
    FROM rh.employees
    WHERE status = 'activo' AND rut_boss IS NOT NULL
    GROUP BY rut_boss
) sub_count ON sub_count.rut_boss = e.rut
WHERE e.status = 'activo';


-- =============================================================
-- 5. Registrar el módulo en app.modulos y asignarlo a 'admin'.
-- =============================================================
INSERT INTO app.modulos (codigo, nombre, descripcion, icono, ruta, orden, activo)
VALUES (
    'costos',
    'Costos por Área',
    'Análisis de costos de colaboradores por área, jefatura, cargo y persona',
    'wallet',
    '/costos',
    60,
    TRUE
)
ON CONFLICT (codigo) DO UPDATE SET
    nombre      = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    icono       = EXCLUDED.icono,
    ruta        = EXCLUDED.ruta,
    orden       = EXCLUDED.orden,
    activo      = EXCLUDED.activo;

INSERT INTO app.rol_modulos (rol_id, modulo_id)
SELECT r.id, m.id
FROM app.roles r, app.modulos m
WHERE r.nombre = 'admin' AND m.codigo = 'costos'
ON CONFLICT DO NOTHING;


-- =============================================================
-- Refresco post-ETL (agregar al DAG, NO ejecutar en esta migración):
--   REFRESH MATERIALIZED VIEW costos.mv_costos_colaboradores;
--   REFRESH MATERIALIZED VIEW costos.mv_jerarquia_jefatura;
-- =============================================================

-- Validaciones manuales post-migración:
--   SELECT count(*) FROM costos.mv_costos_colaboradores;
--   SELECT DISTINCT upper(trim(item_type)) FROM rh.historical_settlement_items;
--   SELECT count(*) FROM costos.mv_jerarquia_jefatura;
--   SELECT count(DISTINCT jefe_rut) FROM costos.mv_jerarquia_jefatura;
