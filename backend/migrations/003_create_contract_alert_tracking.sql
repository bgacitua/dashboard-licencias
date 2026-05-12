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

-- Poblar con alertas enviadas cuyo vencimiento es hoy o posterior y sin respuesta aún.
-- first_alert_sent=true  → SEGUNDO_PLAZO ya notificado
-- second_alert_sent=true → INDEFINIDO ya notificado
INSERT INTO app.contract_alert_tracking (
    employee_id,
    rut,
    employee_name,
    employee_role,
    boss_name,
    boss_email,
    alert_date,
    alert_type,
    alert_reason,
    first_sent_at,
    last_followup_at,
    followup_count,
    created_at,
    updated_at
)
SELECT
    employee_id,
    rut,
    employee_name,
    employee_role,
    boss_name,
    boss_email,
    alert_date,
    alert_type,
    alert_reason,
    updated_at AS first_sent_at,   -- mejor aproximación de cuándo se envió
    updated_at AS last_followup_at,
    0           AS followup_count,
    NOW()       AS created_at,
    NOW()       AS updated_at
FROM rh.contract_alerts
WHERE
    alert_date >= CURRENT_DATE
    AND (
        (alert_type = 'SEGUNDO_PLAZO' AND first_alert_sent  = TRUE)
        OR
        (alert_type = 'INDEFINIDO'    AND second_alert_sent = TRUE)
    )
ON CONFLICT (employee_id, alert_date) DO NOTHING;
