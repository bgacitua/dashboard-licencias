-- Monto total del finiquito congelado al momento de generar la carta.
-- Sirve de referencia: si el total recalculado difiere de este valor, algo cambió
-- durante el proceso (sueldo, licencias, vacaciones) y hay que revisarlo antes de firmar.

ALTER TABLE app.desvinculacion_proceso
    ADD COLUMN IF NOT EXISTS total_finiquito NUMERIC(12, 2);
