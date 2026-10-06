-- =============================================================
-- Migración 028: las modificaciones pasan a ser solicitudes de cambio
-- Aplicar: psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/028_tickets_solicitud_de_cambio.sql
--
-- Hasta ahora una edición del usuario quedaba vigente al instante. Ahora se
-- guarda como versión 'propuesta' y no rige hasta que el administrador la
-- apruebe; si la rechaza, queda en el historial sin haber regido nunca.
--
-- `tickets.version_actual` pasa a significar "la versión que rige", que puede
-- no ser la última: una propuesta pendiente tiene un número mayor.
--
-- Además el administrador puede abrir un plazo de emergencia para un ticket
-- puntual, sin tocar la regla del tipo ni los demás tickets.
--
-- Se puede correr antes del deploy: el código anterior ignora las columnas
-- nuevas, y todas las versiones existentes quedan como 'vigente', que es lo
-- que eran.
--
-- Va entera o no va: si falla a medias, el BEGIN/COMMIT la revierte. Desde un
-- cliente gráfico hay que ejecutarla como script completo.
-- =============================================================

BEGIN;

ALTER TABLE tickets.versiones
    ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'vigente'
        CHECK (estado IN ('vigente', 'propuesta', 'rechazada')),
    ADD COLUMN resuelta_por VARCHAR(150),
    ADD COLUMN resuelta_at  TIMESTAMPTZ;

-- Una sola propuesta pendiente por ticket: dos abiertas a la vez dejarían al
-- administrador aprobando una mientras la otra queda colgando sobre datos viejos.
CREATE UNIQUE INDEX versiones_una_propuesta ON tickets.versiones (ticket_id)
    WHERE estado = 'propuesta';

-- Plazo excepcional para este ticket, por sobre el que fija el tipo. NULL = sin
-- excepción. El motivo y quién lo abrió quedan en tickets.eventos, que ya es
-- donde vive la historia que el usuario ve.
ALTER TABLE tickets.tickets
    ADD COLUMN plazo_emergencia TIMESTAMPTZ,
    ADD COLUMN plazo_emergencia_por VARCHAR(150);

COMMIT;
