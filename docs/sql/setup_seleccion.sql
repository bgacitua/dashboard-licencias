-- =============================================================================
-- Módulo Selección de Personal
-- Ejecutar contra la base de datos rh_cramer
-- =============================================================================

-- 1. Tabla de candidatos (schema rh)
-- =============================================================================
CREATE TABLE IF NOT EXISTS rh.candidatos_seleccion (
    id                  SERIAL PRIMARY KEY,
    empresa             VARCHAR(150) NOT NULL,
    fecha_cierre        DATE,
    rut                 VARCHAR(20),
    nombre              VARCHAR(200) NOT NULL,
    cargo               VARCHAR(150) NOT NULL,
    lugar_de_trabajo    VARCHAR(150),
    jornada_de_trabajo  VARCHAR(100),
    tipo_de_contrato    VARCHAR(100),
    fecha_de_inicio     DATE,
    gerencia            VARCHAR(150),
    sueldo_base         NUMERIC(12, 2),
    bono                NUMERIC(12, 2),
    movilizacion        NUMERIC(12, 2),
    correo_analista     VARCHAR(150),
    status              VARCHAR(50) DEFAULT 'Pendiente'
);

CREATE INDEX IF NOT EXISTS idx_candidatos_seleccion_rut    ON rh.candidatos_seleccion (rut);
CREATE INDEX IF NOT EXISTS idx_candidatos_seleccion_nombre ON rh.candidatos_seleccion (nombre);


-- 2. Rol "seleccion"
-- =============================================================================
INSERT INTO app.roles (nombre, descripcion)
VALUES ('seleccion', 'Analista de selección de personal — acceso al módulo de reclutamiento y cartas de oferta')
ON CONFLICT (nombre) DO NOTHING;


-- 3. Módulo "seleccion"
-- =============================================================================
INSERT INTO app.modulos (codigo, nombre, descripcion, icono, ruta, orden, activo)
VALUES (
    'seleccion',
    'Selección de Personal',
    'Gestión de candidatos seleccionados y generación de cartas de oferta',
    'person_search',
    '/seleccion',
    60,
    TRUE
)
ON CONFLICT (codigo) DO NOTHING;


-- 4. Asociar módulo al rol "seleccion"
-- =============================================================================
INSERT INTO app.rol_modulos (rol_id, modulo_id)
SELECT r.id, m.id
FROM app.roles r, app.modulos m
WHERE r.nombre = 'seleccion'
  AND m.codigo = 'seleccion'
ON CONFLICT DO NOTHING;


-- 4b. Asociar módulo al rol "admin" (acceso total)
-- =============================================================================
INSERT INTO app.rol_modulos (rol_id, modulo_id)
SELECT r.id, m.id
FROM app.roles r, app.modulos m
WHERE r.nombre = 'admin'
  AND m.codigo = 'seleccion'
ON CONFLICT DO NOTHING;
