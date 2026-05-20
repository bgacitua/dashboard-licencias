-- =============================================================
-- Migración 005: Token de invitación para que usuarios
--               establezcan su propia contraseña
-- =============================================================

ALTER TABLE app.usuarios
    ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64) UNIQUE,
    ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS ix_usuarios_invite_token ON app.usuarios (invite_token);
