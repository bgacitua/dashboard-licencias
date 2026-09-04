-- Formularios: envío del enlace por correo.
--
-- El gate público emitía el token contra el RUT que escribía la persona. Ahora
-- el enlace lo dispara RRHH desde el panel y llega al correo del trabajador,
-- así que hay que registrar a qué casilla se mandó: el correo de rh.employees
-- puede cambiar después del envío y el registro tiene que decir dónde llegó.

ALTER TABLE app.form_tokens
    ADD COLUMN IF NOT EXISTS email       VARCHAR(150),
    ADD COLUMN IF NOT EXISTS enviado_por VARCHAR(150);

-- El gestor de respuestas lista por formulario y ordena por fecha; sin esto
-- son seq scans sobre toda la tabla en cuanto haya volumen.
CREATE INDEX IF NOT EXISTS ix_form_tokens_formulario_creado
    ON app.form_tokens (formulario_id, created_at DESC);
