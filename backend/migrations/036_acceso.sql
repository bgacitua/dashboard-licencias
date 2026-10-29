-- ============================================================================
-- Compensaciones — acceso al módulo por usuario (migración 036)
-- Idempotente. Una fila por usuario (username de app.usuarios):
--   admin = true  -> todos los países, homologa, cola masiva, historial de todos
--   admin = false -> solo los países de `paises`; sin fila no ve ningún estudio
--
--   INSERT INTO compensaciones.acceso VALUES ('gpavez', true, '{}');
--   INSERT INTO compensaciones.acceso VALUES ('usuario_peru', false, '{PE}');
--   UPDATE compensaciones.acceso SET paises = '{PE,CL}' WHERE username = 'usuario_peru';
-- ============================================================================

CREATE TABLE IF NOT EXISTS compensaciones.acceso (
    username  text PRIMARY KEY,
    admin     boolean NOT NULL DEFAULT false,
    paises    text[] NOT NULL DEFAULT '{}' CHECK (paises <@ ARRAY['CL', 'PE', 'BR'])
);

INSERT INTO compensaciones.acceso VALUES ('gpavez', true, '{}') ON CONFLICT DO NOTHING;
