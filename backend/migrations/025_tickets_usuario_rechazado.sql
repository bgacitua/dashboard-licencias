-- =============================================================
-- Migración 025: estado 'rechazado' para las cuentas del portal de tickets
-- Aplicar: psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/025_tickets_usuario_rechazado.sql
--
-- Distingue a quien pidió acceso y no fue aprobado de quien fue dado de baja
-- ('inactivo'). El rechazo le llega por correo vía n8n.
--
-- Se puede correr antes o después del deploy: el código anterior nunca escribe
-- 'rechazado', y el nuevo solo lo escribe cuando el admin pulsa "Rechazar".
-- =============================================================

BEGIN;

-- El CHECK de 023 va inline y sin nombre: Postgres lo llamó usuarios_estado_check.
ALTER TABLE tickets.usuarios DROP CONSTRAINT usuarios_estado_check;
ALTER TABLE tickets.usuarios ADD CONSTRAINT usuarios_estado_check
    CHECK (estado IN ('pendiente', 'activo', 'inactivo', 'rechazado'));

COMMIT;
