-- =============================================================
-- Migración 031: los estados de una solicitud
-- Aplicar: psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/031_tickets_estados_de_la_solicitud.sql
--
-- Entran dos estados nuevos:
--
--   en_revision  La solicitud tiene un cambio esperando respuesta. No se pone
--                a mano: la enciende el envío de la propuesta y la apaga el
--                administrador al resolverla, apruebe o rechace, dejando el
--                ticket en 'en_curso'. Hasta ahora la propuesta pendiente solo
--                se veía en tickets.versiones y el estado no decía nada.
--
--   cancelado    El usuario final se bajó de la solicitud. Es distinto de
--                'rechazado', que sigue siendo del administrador y lleva
--                motivo: en el reporte no es lo mismo que el casino rechace a
--                que el solicitante se arrepienta.
--
-- Cancelar no tiene plazo. Si queda menos de TICKETS_CANCELACION_HORAS para el
-- servicio, el ticket se marca en `cancelacion_tardia` porque el casino lo
-- cobra igual. Es un dato del panel y del reporte: al usuario final no se le
-- muestra la política, así que la columna no viaja al portal.
--
-- Se puede correr antes del deploy: el código anterior nunca escribe los
-- estados nuevos ni mira la columna, y el CHECK solo se amplía. Al revés no:
-- desplegar sin correrla deja que el CHECK viejo rechace la primera solicitud
-- de cambio que alguien envíe.
--
-- Va entera o no va: si falla a medias, el BEGIN/COMMIT la revierte. Desde un
-- cliente gráfico hay que ejecutarla como script completo.
-- =============================================================

BEGIN;

-- `tickets_estado_check` es el nombre que Postgres le puso al CHECK en línea de
-- la 023. Sin IF EXISTS a propósito: si no se llamara así, es mejor que la
-- migración falle acá y no que el CHECK viejo quede en pie rechazando en
-- silencio la primera solicitud de cambio.
ALTER TABLE tickets.tickets
    DROP CONSTRAINT tickets_estado_check,
    ADD CONSTRAINT tickets_estado_check
        CHECK (estado IN ('pendiente', 'en_curso', 'en_revision',
                          'cancelado', 'rechazado', 'cerrado'));

-- NULL = no cancelada, que es lo que son todas las de antes. TRUE solo si al
-- cancelar ya estaba dentro de la ventana que se cobra.
ALTER TABLE tickets.tickets
    ADD COLUMN cancelacion_tardia BOOLEAN;

COMMENT ON COLUMN tickets.tickets.cancelacion_tardia IS
    'Canceló con menos de TICKETS_CANCELACION_HORAS para el servicio: el casino lo cobra igual. NULL = no cancelada.';

-- El barrido nocturno busca por estado y fecha de servicio; idx_tickets_estado
-- (estado, fecha_servicio) de la 023 ya sirve para eso.

COMMIT;
