-- =============================================================
-- Migración 004: Registro del módulo Selección de Personal
--               + Mover tabla candidatos_seleccion de rh → app
-- =============================================================

-- Mover tabla al schema app (preserva datos, índices y secuencias)
ALTER TABLE rh.candidatos_seleccion SET SCHEMA app;



INSERT INTO app.modulos (codigo, nombre, descripcion, icono, ruta, orden, activo)
VALUES (
    'seleccion',
    'Selección de Personal',
    'Administración de candidatos, entrevistas y procesos de reclutamiento',
    'person_search',
    '/seleccion',
    70,
    TRUE
)
ON CONFLICT (codigo) DO UPDATE SET
    nombre      = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    icono       = EXCLUDED.icono,
    ruta        = EXCLUDED.ruta,
    orden       = EXCLUDED.orden,
    activo      = EXCLUDED.activo;

-- Asignar a rol admin
INSERT INTO app.rol_modulos (rol_id, modulo_id)
SELECT r.id, m.id
FROM app.roles r, app.modulos m
WHERE r.nombre = 'admin' AND m.codigo = 'seleccion'
ON CONFLICT DO NOTHING;

-- Asignar a rol rrhh
INSERT INTO app.rol_modulos (rol_id, modulo_id)
SELECT r.id, m.id
FROM app.roles r, app.modulos m
WHERE r.nombre = 'rrhh' AND m.codigo = 'seleccion'
ON CONFLICT DO NOTHING;
