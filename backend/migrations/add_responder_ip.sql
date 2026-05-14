-- Cambia response_token de UUID a TEXT para soportar tokens JWT firmados
ALTER TABLE app.contract_alert_tracking
    ALTER COLUMN response_token TYPE TEXT USING response_token::text;

-- Elimina el default UUID (ahora el token se genera en Python)
ALTER TABLE app.contract_alert_tracking
    ALTER COLUMN response_token DROP DEFAULT;

-- Registra la IP de quien presionó el botón de respuesta
ALTER TABLE app.contract_alert_tracking
    ADD COLUMN IF NOT EXISTS responder_ip VARCHAR(45);
