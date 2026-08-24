-- Registro del módulo de asistencia.
--
-- require_module("asistencia") valida contra app.modulos: sin estas filas los
-- endpoints y la entrada del sidebar devuelven 403 aunque el flag esté
-- encendido. Correr a mano (las migraciones no son automáticas).
--
-- Idempotente: se puede correr más de una vez sin duplicar.

INSERT INTO app.modulos (codigo, nombre, descripcion, icono, ruta, orden, activo)
SELECT 'asistencia',
       'Asistencia',
       'Marcajes, auditoría e inasistencias del personal de obra (Buk Ctrl)',
       'fingerprint',
       '/asistencia',
       10,
       TRUE
WHERE NOT EXISTS (SELECT 1 FROM app.modulos WHERE codigo = 'asistencia');

-- Asignación al rol admin. Ampliar a otros roles cuando el módulo se valide.
INSERT INTO app.rol_modulos (rol_id, modulo_id)
SELECT r.id, m.id
FROM app.roles r, app.modulos m
WHERE r.nombre = 'admin'
  AND m.codigo = 'asistencia'
  AND NOT EXISTS (
      SELECT 1 FROM app.rol_modulos rm
      WHERE rm.rol_id = r.id AND rm.modulo_id = m.id
  );
