-- BUK espera dia_uf como string ("uf_fin_de_mes"), no como numero de dia.
-- VARCHAR(2) no alcanza y el INSERT falla con "value too long".
ALTER TABLE app.creditos ALTER COLUMN dia_uf TYPE VARCHAR(20);

-- Creditos ya cargados en BUK quedan como estan: reescribirlos no cambia nada
-- alla. Solo se normalizan los que todavia no se enviaron.
UPDATE app.creditos SET dia_uf = 'uf_fin_de_mes'
WHERE moneda = 'uf' AND buk_credit_id IS NULL AND dia_uf IS NOT NULL;
