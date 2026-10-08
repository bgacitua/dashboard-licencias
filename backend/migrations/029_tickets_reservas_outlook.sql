-- =============================================================
-- Migración 029: la solicitud se cuelga de una reserva de sala de Outlook
-- Aplicar: psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/029_tickets_reservas_outlook.sql
--
-- El usuario ya no escribe la fecha del servicio: elige una de sus reservas de
-- sala, leídas del calendario con Microsoft Graph. De ahí salen la fecha y el
-- bloque horario, que quedan copiados acá.
--
-- La copia es a propósito: mover la reunión en Outlook después no mueve lo ya
-- pedido, igual que el plazo congelado de la 027. `reserva_id` queda guardado
-- solo para poder rastrear de qué evento salió.
--
-- Las columnas van NULL: los tickets anteriores a la integración no tienen
-- reserva y tienen que seguir leyéndose. La obligación de elegir una es del
-- código, no de la tabla.
--
-- Se puede correr antes del deploy: el código anterior ignora las columnas.
--
-- Va entera o no va: si falla a medias, el BEGIN/COMMIT la revierte. Desde un
-- cliente gráfico hay que ejecutarla como script completo.
-- =============================================================

BEGIN;

ALTER TABLE tickets.tickets
    ADD COLUMN hora_inicio    TIME,
    ADD COLUMN hora_fin       TIME,
    ADD COLUMN reserva_id     TEXT,
    ADD COLUMN reserva_asunto VARCHAR(200),
    ADD COLUMN reserva_sala   VARCHAR(200),
    ADD CONSTRAINT tickets_bloque_valido
        CHECK (hora_inicio IS NULL OR hora_fin IS NULL OR hora_inicio < hora_fin);

-- La reserva viaja con la versión: la propuesta puede mover el servicio a otra
-- reunión y solo rige si el administrador la aprueba.
ALTER TABLE tickets.versiones
    ADD COLUMN hora_inicio    TIME,
    ADD COLUMN hora_fin       TIME,
    ADD COLUMN reserva_id     TEXT,
    ADD COLUMN reserva_asunto VARCHAR(200),
    ADD COLUMN reserva_sala   VARCHAR(200),
    ADD CONSTRAINT versiones_bloque_valido
        CHECK (hora_inicio IS NULL OR hora_fin IS NULL OR hora_inicio < hora_fin);

COMMIT;
