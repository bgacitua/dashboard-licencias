-- Rachas de ausencias en días consecutivos que ya se avisaron por correo.
--
-- El job corre a diario sobre una ventana móvil, así que la misma racha se
-- vuelve a detectar todos los días. Esta tabla es lo único que impide que se
-- avise de nuevo: se re-avisa solo si `dias` creció.
--
-- Correr a mano (las migraciones no son automáticas). Idempotente.

CREATE TABLE IF NOT EXISTS app.asistencia_racha_avisada (
    -- `rut|fecha_inicio`: la racha sigue siendo la misma mientras crezca por el
    -- final, así que una que suma días no se cuenta como una nueva.
    clave TEXT PRIMARY KEY,
    dias  INTEGER NOT NULL,
    ts    TIMESTAMPTZ NOT NULL DEFAULT now()
);
