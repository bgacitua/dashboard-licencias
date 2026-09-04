-- Formularios: el trabajador puede corregir su respuesta hasta el vencimiento.
--
-- Antes el token era de un solo uso: se quemaba con el primer submit y el
-- enlace no volvía a abrir. Ahora vale hasta expira_at y cada edición guarda
-- una fila nueva en form_respuestas con la versión siguiente, así que el
-- historial queda completo y nada se sobrescribe.
--
-- used_at cambia de significado: deja de ser "token quemado" y pasa a ser la
-- fecha de la PRIMERA respuesta, que es lo que muestra el gestor.

ALTER TABLE app.form_respuestas
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Las respuestas que ya existen son todas versión 1: antes no se podía editar.
-- El DEFAULT ya las dejó en 1; esto solo lo hace explícito si alguna quedó nula
-- por una carga manual.
UPDATE app.form_respuestas SET version = 1 WHERE version IS NULL;

-- Una versión por token: dos submits concurrentes no pueden crear dos veces la
-- misma. El perdedor reintenta con la siguiente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_respuestas_token_version
    ON app.form_respuestas (token, version);

-- El gestor pide la última versión de cada token.
CREATE INDEX IF NOT EXISTS ix_form_respuestas_formulario_token
    ON app.form_respuestas (formulario_id, token, version DESC);
