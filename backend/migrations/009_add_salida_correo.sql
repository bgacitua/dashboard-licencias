-- Datos del último aviso de salida de personal enviado, para el historial del
-- "Modo Salida". Van en el proceso y no en una tabla de log: interesa el último
-- envío por trabajador, no la traza completa de reenvíos.

ALTER TABLE app.desvinculacion_proceso
    ADD COLUMN IF NOT EXISTS salida_fecha DATE,
    ADD COLUMN IF NOT EXISTS salida_motivo TEXT;
