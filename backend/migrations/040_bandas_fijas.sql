-- ============================================================================
-- Compensaciones — bandas salariales internas fijas (migración 040)
-- Idempotente. Reemplaza la vista v_banda (039), que se recalculaba en vivo con la
-- dotación: ahora la banda es una política que se carga desde la "Tabla Ajustada" de
-- la hoja `bandas` del Excel de cada país con `carga_bandas.py` (fuera del repo) y solo
-- cambia cuando se vuelve a cargar.
-- ============================================================================

DROP VIEW IF EXISTS compensaciones.v_banda;

CREATE TABLE IF NOT EXISTS compensaciones.banda (
    pais       text     NOT NULL,               -- 'CL', 'PE', 'BR'
    grado      smallint NOT NULL,               -- grado HAY
    minimo     numeric  NOT NULL,               -- sueldo base mensual
    midpoint   numeric  NOT NULL,
    maximo     numeric  NOT NULL,
    cargado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (pais, grado),
    CHECK (minimo < midpoint AND midpoint < maximo)
);
