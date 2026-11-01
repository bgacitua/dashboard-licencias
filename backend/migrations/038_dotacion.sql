-- ============================================================================
-- Compensaciones — dotación (migración 038)
-- Idempotente. Diseño: docs/superpowers/specs/2026-11-01-compensaciones-dotacion-design.md
--
-- v_dotacion: personas activas por país (BR se agrega cuando exista su nómina).
-- v_homologacion_vigente: último análisis con cargo_empresa_id por estudio y cargo.
-- rh.vw_employees_anterior y rh.vw_job_history_cambios (historial, solo CL) no
-- van aquí: las mantiene el ETL (create.py).
-- ============================================================================

CREATE OR REPLACE VIEW compensaciones.v_dotacion AS
SELECT 'CL' AS pais, e.id AS employee_id, e.rut AS documento, e.full_name AS nombre, e.role_id,
       e.name_role AS cargo_buk, a.first_level_name AS empresa,
       COALESCE(e.cost_center, a.cost_center) AS centro_costo,
       e.rut_boss AS jefe, e.active_since AS fecha_ingreso, e.picture_url AS url_picture, e.base_wage
FROM rh.employees e LEFT JOIN rh.areas a ON a.id = e.area_id
WHERE e.status = 'activo'
UNION ALL
SELECT 'PE', e.id, e.document_number, e.full_name, e.role_id, e.name_role,
       a.first_level_name, COALESCE(e.cost_center, a.cost_center),
       e.dni_boss, e.active_since, e.picture_url, e.base_wage
FROM rh_peru.employees e LEFT JOIN rh_peru.areas a ON a.id = e.area_id
WHERE e.status = 'activo' AND e.document_number NOT IN ('00000000', '11111111');

CREATE OR REPLACE VIEW compensaciones.v_homologacion_vigente AS
SELECT DISTINCT ON (a.estudio_id, a.cargo_empresa_id)
       a.estudio_id, a.cargo_empresa_id, a.id AS analisis_id, a.cargos_elegidos, a.nivel_codigo
FROM compensaciones.analisis a
WHERE a.cargo_empresa_id IS NOT NULL
ORDER BY a.estudio_id, a.cargo_empresa_id, a.created_at DESC, a.id DESC;
