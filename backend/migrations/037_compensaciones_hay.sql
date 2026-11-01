-- ============================================================================
-- Compensaciones — niveles HAY internos (migración 037)
-- Idempotente. Diseño: docs/superpowers/specs/2026-10-19-compensaciones-niveles-hay-design.md
--
-- Tablas de referencia: metodología HAY única para CL, PE y BR (sin país).
-- Las carga `carga_hay.py referencias` desde Calculadora.xlsx (fuera del repo).
-- hay_evaluacion: una fila por evaluación de un cargo de la empresa; guarda las
-- entradas y un snapshot del resultado. Vigente = la última por cargo.
-- Signo: '-', '' o '+' (texto vacío, no NULL, para que vaya en la PK).
-- ============================================================================

CREATE TABLE IF NOT EXISTS compensaciones.hay_know_how (
    tecnica        text     NOT NULL CHECK (tecnica IN ('A','B','C','D','E','F','G','H')),
    signo_tecnica  text     NOT NULL DEFAULT '' CHECK (signo_tecnica IN ('-','','+')),
    gestion        text     NOT NULL CHECK (gestion IN ('T','I','II','III','IV')),
    signo_gestion  text     NOT NULL DEFAULT '' CHECK (signo_gestion IN ('-','','+')),
    rrhh           smallint NOT NULL CHECK (rrhh BETWEEN 1 AND 3),
    puntos         int      NOT NULL,
    PRIMARY KEY (tecnica, signo_tecnica, gestion, signo_gestion, rrhh)
);

CREATE TABLE IF NOT EXISTS compensaciones.hay_sp_porcentaje (
    marco        text     NOT NULL CHECK (marco IN ('A','B','C','D','E','F','G','H')),
    complejidad  smallint NOT NULL CHECK (complejidad BETWEEN 1 AND 5),
    signo        text     NOT NULL DEFAULT '' CHECK (signo IN ('','+')),
    porcentaje   smallint NOT NULL,
    PRIMARY KEY (marco, complejidad, signo)
);

CREATE TABLE IF NOT EXISTS compensaciones.hay_sp_puntos (
    porcentaje  smallint NOT NULL,
    puntos_kh   int      NOT NULL,
    puntos      int      NOT NULL,
    PRIMARY KEY (porcentaje, puntos_kh)
);

CREATE TABLE IF NOT EXISTS compensaciones.hay_responsabilidad (
    libertad  text NOT NULL CHECK (libertad IN ('A','B','C','D','E','F','G','H')),
    signo     text NOT NULL DEFAULT '' CHECK (signo IN ('-','','+')),
    magnitud  text NOT NULL CHECK (magnitud IN ('N','1','2','3','4')),
    impacto   text NOT NULL CHECK (impacto IN ('I','II','III','IV','V','VI','R','C','S','P')),
    puntos    int  NOT NULL,
    PRIMARY KEY (libertad, signo, magnitud, impacto),
    CHECK ((magnitud = 'N') = (impacto IN ('I','II','III','IV','V','VI')))
);

CREATE TABLE IF NOT EXISTS compensaciones.hay_grado (
    grado       smallint PRIMARY KEY,
    puntos_min  int NOT NULL,
    puntos_max  int NOT NULL,
    CHECK (puntos_min <= puntos_max)
);

CREATE TABLE IF NOT EXISTS compensaciones.hay_evaluacion (
    id                 serial PRIMARY KEY,
    cargo_empresa_id   int  NOT NULL REFERENCES compensaciones.cargo_empresa(id),
    -- entradas
    tecnica            text     NOT NULL,
    signo_tecnica      text     NOT NULL DEFAULT '',
    gestion            text     NOT NULL,
    signo_gestion      text     NOT NULL DEFAULT '',
    rrhh               smallint NOT NULL,
    marco              text     NOT NULL,
    complejidad        smallint NOT NULL,
    signo_complejidad  text     NOT NULL DEFAULT '',
    libertad           text     NOT NULL,
    signo_libertad     text     NOT NULL DEFAULT '',
    magnitud           text     NOT NULL,
    impacto            text     NOT NULL,
    -- snapshot del resultado (no cambia si después se editan las tablas)
    puntos_kh          int      NOT NULL,
    porcentaje_sp      smallint NOT NULL,
    puntos_sp          int      NOT NULL,
    puntos_resp        int      NOT NULL,
    puntos_total       int      NOT NULL,
    grado              smallint NOT NULL,
    comentario         text,
    origen             text NOT NULL DEFAULT 'ui' CHECK (origen IN ('excel','ui')),
    creado_por         text NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hay_evaluacion_cargo_idx
    ON compensaciones.hay_evaluacion (cargo_empresa_id, created_at DESC, id DESC);

-- Evaluación vigente por cargo (la última) + datos del cargo
CREATE OR REPLACE VIEW compensaciones.v_hay_vigente AS
SELECT DISTINCT ON (h.cargo_empresa_id)
       h.cargo_empresa_id, ce.pais, ce.id_origen, ce.code, ce.name,
       h.id AS evaluacion_id, h.puntos_kh, h.porcentaje_sp, h.puntos_sp, h.puntos_resp,
       h.puntos_total, h.grado, h.origen, h.creado_por, h.created_at
FROM compensaciones.hay_evaluacion h
JOIN compensaciones.cargo_empresa ce ON ce.id = h.cargo_empresa_id
ORDER BY h.cargo_empresa_id, h.created_at DESC, h.id DESC;
