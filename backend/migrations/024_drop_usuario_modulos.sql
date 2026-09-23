-- =============================================================
-- Migración 024: eliminar la asignación de módulos directa al usuario
-- Aplicar: psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/024_drop_usuario_modulos.sql
--
-- Los permisos de módulos van solo por perfil (app.rol_modulos). La tabla
-- app.usuario_modulos permitía excepciones por usuario: /auth/me las mostraba
-- en el menú, pero require_module solo revisa el perfil y respondía 403.
--
-- Se borra SIN respaldo, por decisión del negocio (2026-09-23). Los usuarios
-- que tenían módulos directos dejan de verlos en el menú; el acceso real no
-- cambia, porque el backend ya se los negaba. Si alguno debe tener el módulo,
-- se asigna a su perfil.
--
-- Correr DESPUÉS de deployar el código de fix/permisos-solo-por-perfil: el
-- código anterior hace joinedload de esta tabla y fallaría sin ella.
-- =============================================================

BEGIN;

-- Sin CASCADE: si algo ajeno dependiera de esta tabla, que falle en vez de
-- llevárselo por delante.
DROP TABLE IF EXISTS app.usuario_modulos;

COMMIT;
