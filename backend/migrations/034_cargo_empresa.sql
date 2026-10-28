-- ============================================================================
-- Compensaciones — cargos de la empresa y homologación (migración 034)
-- Idempotente. Diseño: claude/diseno_cargos_empresa_v1.md
--
-- cargo_empresa: copia de los roles de BUK (Snowflake, una tabla por país) que
-- hace n8n con upsert por (pais, id_origen); no borra, los que desaparecen
-- quedan de respaldo. id propio porque el ID de origen se repite entre países.
-- Homologación = análisis guardado con cargo_empresa_id (vigente = el último).
-- ============================================================================

CREATE TABLE IF NOT EXISTS compensaciones.cargo_empresa (
    id               serial PRIMARY KEY,
    pais             text NOT NULL,          -- 'CL', 'PE', 'BR'
    id_origen        integer NOT NULL,       -- ID de Snowflake = role_id de BUK
    code             text NOT NULL,
    name             text NOT NULL,
    description      text,                   -- objetivos: descriptor del match
    requirements     text,                   -- solo se muestra
    role_family      integer[],
    area_ids         integer[],
    sincronizado_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pais, id_origen)
);

ALTER TABLE compensaciones.analisis
    ADD COLUMN IF NOT EXISTS cargo_empresa_id integer REFERENCES compensaciones.cargo_empresa(id);

CREATE INDEX IF NOT EXISTS analisis_cargo_empresa_idx
    ON compensaciones.analisis (estudio_id, cargo_empresa_id, created_at DESC);

-- n8n escribe solo en cargo_empresa
GRANT USAGE ON SCHEMA compensaciones TO n8n_writer;
GRANT SELECT, INSERT, UPDATE ON compensaciones.cargo_empresa TO n8n_writer;
GRANT USAGE ON SEQUENCE compensaciones.cargo_empresa_id_seq TO n8n_writer;
