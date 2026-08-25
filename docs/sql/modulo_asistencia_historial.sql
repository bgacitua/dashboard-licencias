-- Historial de marcas y operaciones de corrección del módulo de asistencia.
--
-- Buk no deja consultar qué mandó este módulo ni deshacerlo: estas tablas son
-- el único registro de qué se escribió y con qué resultado.
--
-- Correr a mano (las migraciones no son automáticas). Idempotente.

CREATE TABLE IF NOT EXISTS app.asistencia_historial (
    id      BIGSERIAL PRIMARY KEY,
    ts      TEXT NOT NULL,          -- ISO UTC del envío
    obra_id TEXT NOT NULL,
    rut     TEXT NOT NULL,
    sentido TEXT NOT NULL,          -- entrada | salida
    fecha   TEXT NOT NULL,          -- d/M/yyyy, tal como se mandó a Buk
    hora    TEXT NOT NULL,          -- H:m:s, ídem
    mov     TEXT NOT NULL DEFAULT '',
    ok      BOOLEAN NOT NULL,
    detail  TEXT NOT NULL DEFAULT ''
);

-- La vista de historial siempre filtra por fecha de envío.
CREATE INDEX IF NOT EXISTS asistencia_historial_ts_idx
    ON app.asistencia_historial (ts DESC);

-- Una tanda de corrección en curso, para poder retomarla sin volver a subir
-- los archivos.
CREATE TABLE IF NOT EXISTS app.asistencia_operacion (
    id         BIGSERIAL PRIMARY KEY,
    obra_id    TEXT NOT NULL,
    desde      TEXT NOT NULL,
    hasta      TEXT NOT NULL,
    label      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app.asistencia_operacion_registro (
    id           BIGSERIAL PRIMARY KEY,
    op_id        BIGINT NOT NULL REFERENCES app.asistencia_operacion(id),
    record_id    TEXT NOT NULL,
    rut          TEXT NOT NULL,
    nombre       TEXT NOT NULL DEFAULT '',
    fecha        TEXT NOT NULL,          -- yyyy-mm-dd
    hora_intento TEXT NOT NULL DEFAULT '',
    sentido      TEXT NOT NULL,
    turno_inicio TEXT NOT NULL DEFAULT '',
    turno_fin    TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'pending',  -- pending | synced | discarded
    updated_at   TEXT NOT NULL,
    -- Reanudar una operación reinserta sus registros: la clave evita duplicarlos.
    UNIQUE (op_id, record_id)
);

CREATE INDEX IF NOT EXISTS asistencia_operacion_registro_op_idx
    ON app.asistencia_operacion_registro (op_id);
