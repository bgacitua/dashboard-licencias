-- =============================================================
-- Migración 020: interruptor manual de la vigilancia de líquidos
--
-- Antes el barrido se auto-activaba por calendario (desde la fecha de cierre
-- hasta fin de mes). Ahora se prende y se apaga a mano desde la plataforma:
-- esta tabla guarda ese estado, con una sola fila.
--
-- Aplicar: psql -d rh_cramer -f backend/migrations/020_liquidaciones_vigilancia.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS app.liquidaciones_vigilancia (
    -- Fila única: el CHECK impide que se cuelen estados paralelos.
    id              SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    activa          BOOLEAN      NOT NULL DEFAULT FALSE,
    periodo         VARCHAR(7),              -- 'YYYY-MM' vigilado al activar
    actualizado_por VARCHAR(100),
    actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO app.liquidaciones_vigilancia (id, activa) VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;
