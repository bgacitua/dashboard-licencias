-- =============================================================
-- Migración 012: Tipo de préstamo que se imprime en el comprobante
-- Solo necesaria si ya aplicaste la 011. Si no, la 011 ya trae la columna.
-- Aplicar: psql -d rh_cramer -f backend/migrations/012_creditos_tipo_prestamo.sql
-- =============================================================

ALTER TABLE app.creditos
    ADD COLUMN IF NOT EXISTS tipo_prestamo VARCHAR(50) NOT NULL DEFAULT 'Préstamo Emergencia';

ALTER TABLE app.creditos
    ALTER COLUMN nombre SET DEFAULT 'Préstamo Interno';
