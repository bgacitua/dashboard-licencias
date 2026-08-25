-- =============================================================
-- Migración 016: el token de invitación se guarda hasheado
--
-- Antes se almacenaba en claro: un dump de la base entregaba
-- enlaces de invitación vivos. Ahora la columna guarda el
-- SHA-256 (64 hex) y el token en claro solo viaja en el correo.
--
-- Las invitaciones pendientes al momento de migrar quedan
-- invalidadas (no se puede derivar el hash desde el token ya
-- enviado). Reenviarlas desde el panel de administración.
-- =============================================================

UPDATE app.usuarios
   SET invite_token = NULL,
       invite_token_expires_at = NULL
 WHERE invite_token IS NOT NULL;
