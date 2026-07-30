-- Horas extras fin de semana: solicitud semanal por jefe + selecciones.
-- Aplicar manualmente:  psql -d rh_cramer -f 009_create_overtime.sql

CREATE TABLE IF NOT EXISTS app.overtime_requests (
    id              SERIAL PRIMARY KEY,
    week_start      DATE        NOT NULL,          -- lunes de la semana vigente
    boss_rut        TEXT        NOT NULL,
    boss_name       TEXT,
    boss_email      TEXT        NOT NULL,
    response_token  TEXT        NOT NULL,
    deadline        TIMESTAMPTZ NOT NULL,
    sent_at         TIMESTAMPTZ DEFAULT NOW(),
    responded_at    TIMESTAMPTZ,
    responder_ip    TEXT,
    CONSTRAINT uq_overtime_week_boss UNIQUE (week_start, boss_rut)
);

CREATE INDEX IF NOT EXISTS ix_overtime_requests_token ON app.overtime_requests (response_token);
CREATE INDEX IF NOT EXISTS ix_overtime_requests_week  ON app.overtime_requests (week_start);

-- Solo se guardan los trabajadores marcados. Sin filas = el jefe respondió "nadie".
CREATE TABLE IF NOT EXISTS app.overtime_selections (
    id            SERIAL PRIMARY KEY,
    request_id    INT  NOT NULL REFERENCES app.overtime_requests(id) ON DELETE CASCADE,
    employee_rut  TEXT NOT NULL,
    employee_name TEXT,
    cargo         TEXT,
    area          TEXT,
    sabado        BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_overtime_sel UNIQUE (request_id, employee_rut)
);

CREATE INDEX IF NOT EXISTS ix_overtime_selections_request ON app.overtime_selections (request_id);
