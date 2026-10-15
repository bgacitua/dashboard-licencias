-- =============================================================
-- Migración 032: la vigencia del token sale de su propia fecha
-- Aplicar: psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/032_contract_alerts_token_issued_at.sql
--
-- last_followup_at venía cargando dos cosas a la vez:
--
--   1. La cadencia del recordatorio. get_pending_followups() pide
--      (CURRENT_DATE - last_followup_at::date) >= 3, o sea 3 días desde la
--      última alerta del envío principal. Mientras nadie responda, la condición
--      se sigue cumpliendo al día siguiente, y eso es lo que se busca: el
--      recordatorio sale todos los días hasta que la jefatura conteste.
--
--   2. La vigencia del link. _lookup_token() caduca el token a las 72 horas de
--      esa misma fecha.
--
-- Mientras el recordatorio no emitía token nuevo, los dos usos convivían. Al
-- emitirlo hay que reabrir la ventana sin mover la cadencia, y una sola fecha
-- no puede hacer las dos: moverla apaga el recordatorio diario, no moverla deja
-- el link muerto. token_issued_at se queda con la vigencia y last_followup_at
-- vuelve a ser solo la cadencia.
--
-- Correr ANTES del deploy. El código anterior no mira la columna, así que puede
-- esperar sin molestar; al revés no: el código nuevo la lee en get_by_token y
-- la escribe en cada envío, y sin la columna falla toda respuesta a una alerta.
--
-- El backfill deja a las filas vivas con el ancla que ya tenían: ningún link en
-- circulación cambia de vigencia al aplicar esto.
--
-- Va entera o no va: si falla a medias, el BEGIN/COMMIT la revierte. Desde un
-- cliente gráfico hay que ejecutarla como script completo.
-- =============================================================

BEGIN;

ALTER TABLE app.contract_alert_tracking
    ADD COLUMN IF NOT EXISTS token_issued_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN app.contract_alert_tracking.token_issued_at IS
    'Cuándo se emitió el response_token vigente. Ancla de TOKEN_TTL_HORAS.';

COMMENT ON COLUMN app.contract_alert_tracking.last_followup_at IS
    'Último envío de la alerta principal. Marca la cadencia del recordatorio, no la vigencia del token.';

UPDATE app.contract_alert_tracking
SET token_issued_at = COALESCE(last_followup_at, first_sent_at)
WHERE token_issued_at IS NULL;

COMMIT;
