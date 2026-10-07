-- Centro de notificaciones: estado de gestión de cada respuesta de jefatura.
--
-- La respuesta ya vivía en app.asistencia_notificacion_fecha; lo que falta es
-- saber qué se hizo con ella. El círculo rojo cuenta las filas respondidas con
-- gestion = '': una respuesta deja de pesar cuando se gestionó, no cuando
-- alguien la miró.
--
-- Correr a mano (las migraciones no son automáticas). Idempotente.

ALTER TABLE app.asistencia_notificacion_fecha
    -- '' = pendiente | permiso = se creó en Buk | descartada = no corresponde
    ADD COLUMN IF NOT EXISTS gestion     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS gestion_at  TIMESTAMPTZ,
    -- Usuario de la plataforma que gestionó, para saber a quién preguntarle.
    ADD COLUMN IF NOT EXISTS gestion_por TEXT NOT NULL DEFAULT '',
    -- Identificador que devuelve Buk al crear el permiso. Es el único rastro:
    -- desde acá no se puede consultar ni deshacer lo que se creó allá.
    ADD COLUMN IF NOT EXISTS buk_ref     TEXT NOT NULL DEFAULT '';

-- El panel pide siempre las respondidas sin gestionar; son pocas frente al
-- total histórico, así que el índice parcial es el que corresponde.
CREATE INDEX IF NOT EXISTS asistencia_notificacion_fecha_pendiente_idx
    ON app.asistencia_notificacion_fecha (fecha)
    WHERE gestion = '' AND respuesta <> '';
