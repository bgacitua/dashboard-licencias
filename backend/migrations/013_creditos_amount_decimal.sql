-- =============================================================
-- Migración 013: El valor de la cuota admite decimales (montos en UF)
-- Aplicar: psql -d rh_cramer -f backend/migrations/013_creditos_amount_decimal.sql
-- =============================================================

ALTER TABLE app.creditos
    ALTER COLUMN amount TYPE NUMERIC(12, 2);
