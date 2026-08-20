-- =============================================================
-- Migración 014: Alerta de descuadre de líquidos en período de cierre
--
-- snapshot  = foto de los líquidos tomada el día del cierre (target congelado)
-- descuadre = diferencias detectadas contra ese target en los barridos posteriores
--
-- Aplicar: psql -d rh_cramer -f backend/migrations/014_liquidaciones_descuadre.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS app.liquidaciones_snapshot (
    periodo      VARCHAR(7)    NOT NULL,   -- 'YYYY-MM'
    employee_id  INTEGER       NOT NULL,
    liquido      NUMERIC(12,2) NOT NULL,
    tomado_en    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (periodo, employee_id)
);

CREATE TABLE IF NOT EXISTS app.liquidaciones_descuadre (
    id              SERIAL        PRIMARY KEY,
    periodo         VARCHAR(7)    NOT NULL,
    employee_id     INTEGER       NOT NULL,
    rut             VARCHAR(15),
    liquido_target  NUMERIC(12,2),          -- NULL = alta posterior al cierre
    liquido_actual  NUMERIC(12,2),          -- NULL = baja posterior al cierre
    detectado_en    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Deduplicación: un mismo (empleado, período, valor nuevo) se registra una sola vez,
-- así un descuadre que persiste no vuelve a notificar en cada barrido.
-- COALESCE porque en Postgres NULL != NULL rompería el UNIQUE en altas/bajas.
CREATE UNIQUE INDEX IF NOT EXISTS ux_liquidaciones_descuadre_dedup
    ON app.liquidaciones_descuadre (periodo, employee_id, COALESCE(liquido_actual, -1));

CREATE INDEX IF NOT EXISTS ix_liquidaciones_descuadre_periodo
    ON app.liquidaciones_descuadre (periodo, detectado_en DESC);
