-- ============================================================================
-- Compensaciones — catálogo CBO de Brasil (migración 035)
-- Idempotente. Lo llena `carga_compensaciones.py cbo "cbo - consolidado.csv"`.
--
-- Los cargos BR traen el código CBO en cargo_empresa.code; sus títulos se
-- agregan al descriptor del match (repository.cargos_empresa).
-- ============================================================================

CREATE TABLE IF NOT EXISTS compensaciones.cbo (
    codigo   text PRIMARY KEY CHECK (codigo ~ '^[0-9]{6}$'),   -- 251540 (CBO 2515-40)
    titulos  text NOT NULL                                     -- sinónimos separados por ', '
);
