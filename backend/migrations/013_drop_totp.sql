-- Migración a Duo Security como segundo factor.
-- El enrolamiento y los dispositivos los administra Duo, así que el estado
-- TOTP local y los OTP de correo dejan de usarse.
--
-- Ejecutar DESPUÉS de desplegar la versión con Duo: mientras la versión
-- anterior siga en línea, seguirá leyendo estas columnas.

DROP TABLE IF EXISTS app.otp_codes;

ALTER TABLE app.usuarios DROP COLUMN IF EXISTS totp_secret;
ALTER TABLE app.usuarios DROP COLUMN IF EXISTS totp_enabled;
