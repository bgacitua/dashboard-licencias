-- =============================================================
-- Migración 030: el servicio se pide para un tramo dentro de la reserva
-- Aplicar: psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/030_tickets_horario_del_servicio.sql
--
-- La 029 dejó el bloque de la reserva en hora_inicio / hora_fin. Ahora el
-- usuario elige además desde y hasta cuándo quiere el servicio, que puede ser
-- más corto que la reunión (café a las 15:30 en una reserva de 15:00 a 17:00).
--
-- Son columnas aparte y no un reemplazo: el bloque reservado y lo pedido
-- dentro de él son dos cosas distintas, y el panel necesita ver las dos para
-- saber si lo que piden cabe donde dicen.
--
-- Van NULL: los tickets anteriores no tienen tramo elegido y se siguen
-- leyendo como el bloque completo. Exigirlo es del código, no de la tabla.
--
-- Se puede correr antes del deploy: el código anterior ignora las columnas.
--
-- Va entera o no va: si falla a medias, el BEGIN/COMMIT la revierte. Desde un
-- cliente gráfico hay que ejecutarla como script completo.
-- =============================================================

BEGIN;

ALTER TABLE tickets.tickets
    ADD COLUMN servicio_inicio TIME,
    ADD COLUMN servicio_fin    TIME,
    ADD CONSTRAINT tickets_servicio_valido
        CHECK (servicio_inicio IS NULL OR servicio_fin IS NULL OR servicio_inicio < servicio_fin),
    -- El tramo tiene que caber en la reserva. Es la misma regla que valida el
    -- backend contra Graph; acá queda escrita para que no haya forma de meter
    -- por otra vía un servicio fuera de la reunión que lo justifica.
    ADD CONSTRAINT tickets_servicio_en_bloque
        CHECK (servicio_inicio IS NULL OR hora_inicio IS NULL
               OR (servicio_inicio >= hora_inicio AND servicio_fin <= hora_fin));

ALTER TABLE tickets.versiones
    ADD COLUMN servicio_inicio TIME,
    ADD COLUMN servicio_fin    TIME,
    ADD CONSTRAINT versiones_servicio_valido
        CHECK (servicio_inicio IS NULL OR servicio_fin IS NULL OR servicio_inicio < servicio_fin),
    ADD CONSTRAINT versiones_servicio_en_bloque
        CHECK (servicio_inicio IS NULL OR hora_inicio IS NULL
               OR (servicio_inicio >= hora_inicio AND servicio_fin <= hora_fin));

COMMIT;
