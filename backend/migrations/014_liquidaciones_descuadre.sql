-- =============================================================
-- Migración 014: Alerta de descuadre de liquidaciones en período de cierre
--
-- snapshot  = foto de los montos tomada el día del cierre (target congelado)
-- descuadre = diferencias detectadas contra ese target en los barridos posteriores
--
-- Se vigilan cuatro campos: líquido, bruto y las dos bases de cotización.
--
-- Aplicar: psql -d rh_cramer -f backend/migrations/014_liquidaciones_descuadre.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS app.liquidaciones_snapshot (
    periodo       VARCHAR(7)    NOT NULL,   -- 'YYYY-MM'
    employee_id   INTEGER       NOT NULL,
    -- El rut se congela junto con los montos: en una baja posterior al cierre es
    -- el único lugar donde queda, porque el trabajador ya no viene en la lectura.
    rut           VARCHAR(15),
    income_net    NUMERIC(14,2),            -- líquido
    income_gross  NUMERIC(14,2),            -- bruto
    income_afp    NUMERIC(14,2),            -- base de cotización AFP
    income_ips    NUMERIC(14,2),            -- base de cotización IPS
    tomado_en     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (periodo, employee_id)
);

CREATE TABLE IF NOT EXISTS app.liquidaciones_descuadre (
    id            SERIAL        PRIMARY KEY,
    periodo       VARCHAR(7)    NOT NULL,
    employee_id   INTEGER       NOT NULL,
    rut           VARCHAR(15),
    -- Nombre del campo que se movió (income_net, income_gross, income_afp,
    -- income_ips) o bien alta_post_cierre / baja_post_cierre.
    campo         VARCHAR(30)   NOT NULL,
    valor_target  NUMERIC(14,2),
    valor_actual  NUMERIC(14,2),
    detectado_en  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Deduplicación: un mismo (empleado, período, campo, valor nuevo) se registra una
-- sola vez, así un descuadre que persiste no vuelve a notificar en cada barrido.
-- COALESCE porque en Postgres NULL != NULL dejaría pasar duplicados en las bajas.
CREATE UNIQUE INDEX IF NOT EXISTS ux_liquidaciones_descuadre_dedup
    ON app.liquidaciones_descuadre
       (periodo, employee_id, campo, COALESCE(valor_actual, -1));

CREATE INDEX IF NOT EXISTS ix_liquidaciones_descuadre_periodo
    ON app.liquidaciones_descuadre (periodo, detectado_en DESC);
