-- Días con turno exigible y cero marcas de torniquete, calculados por semana.
--
-- Morpho no aguanta rangos largos, así que el mes se arma por tramos cortos y
-- se acumula acá. Recalcular un tramo lo reemplaza entero: si Buk cargó una
-- licencia después, al volver a correr la semana el día desaparece solo.
--
-- Correr a mano (las migraciones no son automáticas). Idempotente.

CREATE TABLE IF NOT EXISTS app.asistencia_sin_marca (
    rut          TEXT NOT NULL,
    fecha        DATE NOT NULL,
    nombre       TEXT NOT NULL DEFAULT '',
    -- Obra con la que se calculó el tramo: '' = sin filtro. Delimita qué filas
    -- borra un recálculo, para que recalcular una obra no vacíe las otras.
    obra_id      TEXT NOT NULL DEFAULT '',
    -- Foto al momento del cálculo (rh.employees): el informe de un mes cerrado
    -- no debería cambiar porque alguien cambió de jefatura después.
    cargo        TEXT NOT NULL DEFAULT '',
    jefe         TEXT NOT NULL DEFAULT '',
    area         TEXT NOT NULL DEFAULT '',
    recinto      TEXT NOT NULL DEFAULT '',
    calculado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (rut, fecha)
);

CREATE INDEX IF NOT EXISTS asistencia_sin_marca_fecha_idx
    ON app.asistencia_sin_marca (fecha);

-- Para una base que ya tenía la tabla sin estas columnas.
ALTER TABLE app.asistencia_sin_marca ADD COLUMN IF NOT EXISTS cargo   TEXT NOT NULL DEFAULT '';
ALTER TABLE app.asistencia_sin_marca ADD COLUMN IF NOT EXISTS jefe    TEXT NOT NULL DEFAULT '';
ALTER TABLE app.asistencia_sin_marca ADD COLUMN IF NOT EXISTS area    TEXT NOT NULL DEFAULT '';
ALTER TABLE app.asistencia_sin_marca ADD COLUMN IF NOT EXISTS recinto TEXT NOT NULL DEFAULT '';
