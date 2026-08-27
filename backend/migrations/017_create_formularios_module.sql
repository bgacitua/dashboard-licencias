-- =============================================================
-- Migración 017: Módulo Formularios (builder + gate + respuestas)
-- Aplicar: psql -d rh_cramer -f backend/migrations/017_create_formularios_module.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS app.formularios (
    id                SERIAL PRIMARY KEY,
    slug              VARCHAR(80)  NOT NULL UNIQUE,
    titulo            VARCHAR(200) NOT NULL,
    -- JSON de survey-core tal cual lo produce el builder.
    definicion        JSONB        NOT NULL DEFAULT '{"pages":[]}'::jsonb,
    -- Webhook de n8n al que se empuja cada respuesta. Host validado contra
    -- FORMULARIOS_N8N_HOSTS en la app: es una URL que edita un admin y que el
    -- backend luego llama.
    n8n_webhook_url   TEXT,
    activo            BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_por        VARCHAR(150),
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Token de un solo uso que emite el gate tras validar el RUT contra rh.employees.
CREATE TABLE IF NOT EXISTS app.form_tokens (
    token           VARCHAR(64) PRIMARY KEY,
    formulario_id   INTEGER     NOT NULL REFERENCES app.formularios(id) ON DELETE CASCADE,
    rut             VARCHAR(20) NOT NULL,
    expira_at       TIMESTAMP   NOT NULL,
    -- NULL = sin usar. El consumo es un UPDATE condicional sobre esta columna.
    used_at         TIMESTAMP,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_tokens_formulario ON app.form_tokens(formulario_id);
CREATE INDEX IF NOT EXISTS idx_form_tokens_expira     ON app.form_tokens(expira_at);

CREATE TABLE IF NOT EXISTS app.form_respuestas (
    id              SERIAL PRIMARY KEY,
    formulario_id   INTEGER     NOT NULL REFERENCES app.formularios(id) ON DELETE CASCADE,
    token           VARCHAR(64),
    rut             VARCHAR(20),
    datos           JSONB       NOT NULL,
    ip              VARCHAR(64),
    -- NULL = todavía no se intentó; FALSE = n8n no recibió y hay que reprocesar.
    n8n_ok          BOOLEAN,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_respuestas_formulario ON app.form_respuestas(formulario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_respuestas_pendientes ON app.form_respuestas(n8n_ok) WHERE n8n_ok IS NOT TRUE;

INSERT INTO app.modulos (codigo, nombre, descripcion, icono, ruta, orden, activo)
VALUES ('formularios', 'Formularios', 'Constructor de formularios internos y recepción de respuestas',
        'ClipboardList', '/formularios/admin', 90, TRUE)
ON CONFLICT (codigo) DO NOTHING;
