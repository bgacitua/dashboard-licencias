-- =============================================================
-- Migración 027: costo congelado en cada versión de un ticket
-- Aplicar: psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/027_tickets_costo_congelado.sql
--
-- El costo se calcula al guardar la versión y se deja escrito ahí. No se
-- recalcula nunca: un reporte ya emitido no puede moverse porque después
-- cambie el catálogo o el precio de un servicio.
--
-- Forma del JSON:
--   {"total": 17500,
--    "lineas": [{"servicio_id": 4, "nombre": "Coffee Básico", "modo": "cantidad",
--                "valor_unitario": 3500, "cantidad": 5, "subtotal": 17500}]}
--
-- NULL = versión anterior a esta migración, o cuyo formulario no tiene ningún
-- servicio con precio. No es lo mismo que un total de 0, y por eso no se
-- rellena con un default: inventar costos hacia atrás sería peor que no tenerlos.
--
-- Se puede correr antes del deploy: el código anterior ignora la columna.
--
-- Va entera o no va: si falla a medias, el BEGIN/COMMIT la revierte. Desde un
-- cliente gráfico hay que ejecutarla como script completo.
-- =============================================================

BEGIN;

ALTER TABLE tickets.versiones ADD COLUMN costo JSONB;

COMMIT;
