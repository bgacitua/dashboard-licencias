-- Tabla de auditoría de eventos en el flujo de respuesta de alertas de contratos.
-- Registra cada interacción: apertura del link y envío de confirmación.

CREATE TABLE IF NOT EXISTS app.contract_alert_events (
    id              SERIAL PRIMARY KEY,
    tracking_id     INTEGER NOT NULL REFERENCES app.contract_alert_tracking(id) ON DELETE CASCADE,
    event_type      VARCHAR(50) NOT NULL,   -- 'link_opened' | 'confirm_submitted'
    answer          VARCHAR(20),            -- 'indefinido' | 'plazo_fijo' | 'no_renovar'
    ip              VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_events_tracking_id ON app.contract_alert_events(tracking_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_event_type  ON app.contract_alert_events(event_type);
CREATE INDEX IF NOT EXISTS idx_alert_events_created_at  ON app.contract_alert_events(created_at);
