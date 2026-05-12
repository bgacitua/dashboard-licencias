-- Tabla de seguimiento de alertas de contratos enviadas
-- Registra cada alerta enviada, su token de respuesta, follow-ups y respuesta de la jefatura.

CREATE TABLE IF NOT EXISTS app.contract_alert_tracking (
    id                  SERIAL PRIMARY KEY,
    employee_id         INTEGER NOT NULL,
    rut                 VARCHAR(20) NOT NULL,
    employee_name       VARCHAR(255),
    employee_role       VARCHAR(255),
    boss_name           VARCHAR(255),
    boss_email          VARCHAR(255) NOT NULL,
    alert_date          DATE NOT NULL,
    alert_type          VARCHAR(50),
    alert_reason        VARCHAR(500),
    response_token      UUID UNIQUE DEFAULT gen_random_uuid(),
    first_sent_at       TIMESTAMP WITH TIME ZONE,
    last_followup_at    TIMESTAMP WITH TIME ZONE,
    followup_count      INTEGER NOT NULL DEFAULT 0,
    response            VARCHAR(20),        -- 'indefinido' | 'plazo_fijo' | 'no_renovar'
    responded_at        TIMESTAMP WITH TIME ZONE,
    buk_synced          BOOLEAN NOT NULL DEFAULT FALSE,
    buk_synced_at       TIMESTAMP WITH TIME ZONE,
    buk_sync_error      TEXT,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_tracking_employee_date UNIQUE (employee_id, alert_date)
);

CREATE INDEX IF NOT EXISTS idx_tracking_boss_email  ON app.contract_alert_tracking(boss_email);
CREATE INDEX IF NOT EXISTS idx_tracking_alert_date  ON app.contract_alert_tracking(alert_date);
CREATE INDEX IF NOT EXISTS idx_tracking_response    ON app.contract_alert_tracking(response);
CREATE INDEX IF NOT EXISTS idx_tracking_token       ON app.contract_alert_tracking(response_token);
