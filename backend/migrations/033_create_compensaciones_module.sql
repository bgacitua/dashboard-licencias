-- ============================================================================
-- Schema compensaciones — datos de estudios de mercado (etapa 1)
-- Migración 033. Idempotente: en rh_cramer el schema ya existe con datos de Chile.
--
-- Todo cuelga de `estudio` (un estudio = consultora + país + año). La carga es
-- por estudio: upsert de puesto por (estudio_id, codigo) y reemplazo de sus
-- estadísticas, así recargar Chile no toca Perú ni borra los vectores.
--
-- Código Mercer de 4 segmentos FAM.SUB.CARGO.NIVEL  (SCN.03.017.M30)
--   cargo_codigo = SCN.03.017  -> unidad del match (el nivel se elige después)
--   CARGO = 000                -> core job = agregado de la subfamilia en ese nivel
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS compensaciones;

-- ---------------------------------------------------------------- lookups --
CREATE TABLE IF NOT EXISTS compensaciones.nivel (
    codigo  text PRIMARY KEY,           -- columna E del Excel: S10, P20, M30, ET1
    nombre  text NOT NULL,
    escala  text NOT NULL,              -- S / P / M / ET
    grado   smallint NOT NULL,
    altura  smallint NOT NULL           -- orden comparable entre escalas (ET1 es el más alto)
);

INSERT INTO compensaciones.nivel (codigo, nombre, escala, grado, altura) VALUES
 ('S10','Para-Profesional Principiante (S1)','S',1,1),
 ('S20','Para-Profesional Experimentado (S2)','S',2,2),
 ('S30','Para-Profesional Senior (S3)','S',3,3),
 ('S40','Para-Profesional Especialista (S4)','S',4,4),
 ('P10','Profesional Principiante (P1)','P',1,3),
 ('P20','Profesional Experimentado (P2)','P',2,4),
 ('P30','Profesional Senior (P3)','P',3,5),
 ('P40','Profesional Especialista (P4)','P',4,6),
 ('P50','Profesional Experto (P5)','P',5,7),
 ('P60','Profesional Preeminente (P6)','P',6,8),
 ('M10','Líder del Equipo (Para-Profesionales) (M1)','M',1,5),
 ('M20','Líder del Equipo (Profesionales) (M2)','M',2,6),
 ('M30','Gerente (M3)','M',3,7),
 ('M40','Gerente Senior (M4)','M',4,8),
 ('M50','Director (M5)','M',5,9),
 ('M60','Director Sénior (M6)','M',6,10),
 ('ET3','Nivel Ejecutivo 3 (ET3)','ET',3,11),
 ('ET2','Nivel Ejecutivo 2 (ET2)','ET',2,12),
 ('ET1','Nivel Ejecutivo 1 (ET1)','ET',1,13)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS compensaciones.medida (
    codigo  text PRIMARY KEY,
    nombre  text NOT NULL,
    orden   smallint NOT NULL
);

INSERT INTO compensaciones.medida (codigo, nombre, orden) VALUES
 ('COMP1',       'Salario Base Anual', 1),
 ('COMP2',       'Efectivo Garantizado Anual', 2),
 ('COMP3_TARGET','Efectivo Total Anual (Target)', 3),
 ('COMP3_REAL',  'Efectivo Total Anual (Real)', 4),
 ('COMP4_TARGET','Compensación Total Directa Anual (Target)', 5),
 ('COMP4_REAL',  'Compensación Total Directa Anual (Real)', 6),
 ('COMP5_TARGET','Remuneración Total Anual (Target)', 7),
 ('COMP5_REAL',  'Remuneración Total Anual (Real)', 8)
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------- estudio --
CREATE TABLE IF NOT EXISTS compensaciones.estudio (
    id              serial PRIMARY KEY,
    vista           text NOT NULL UNIQUE,           -- '2025 CL TRS' (columna A del Excel)
    consultora      text NOT NULL DEFAULT 'Mercer',
    pais            char(2) NOT NULL,               -- CL / PE
    anio            smallint NOT NULL,
    moneda          char(3) NOT NULL,               -- CLP / PEN
    factor_mensual  numeric NOT NULL DEFAULT 12,    -- COMP1 anual / factor = mensual · CL 12, PE 14
    archivo         text,
    cargado_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pais, anio, consultora)
);

-- ----------------------------------------------------------------- puesto --
CREATE TABLE IF NOT EXISTS compensaciones.puesto (
    id                 serial PRIMARY KEY,
    estudio_id         int  NOT NULL REFERENCES compensaciones.estudio ON DELETE CASCADE,
    codigo             text NOT NULL,                                       -- SCN.03.017.M30
    cargo_codigo       text GENERATED ALWAYS AS (split_part(codigo,'.',1) || '.' ||
                                                 split_part(codigo,'.',2) || '.' ||
                                                 split_part(codigo,'.',3)) STORED,
    subfamilia_codigo  text GENERATED ALWAYS AS (split_part(codigo,'.',1) || '.' ||
                                                 split_part(codigo,'.',2)) STORED,
    es_core            boolean GENERATED ALWAYS AS (split_part(codigo,'.',3) = '000') STORED,
    nivel_codigo       text NOT NULL REFERENCES compensaciones.nivel
                       CHECK (nivel_codigo = split_part(codigo,'.',4)),
    titulo             text NOT NULL,      -- título sin el nivel: 'Abastecimiento de Materiales'
    titulo_tipico      text,               -- sinónimos de mercado ('--' -> NULL)
    descripcion        text,
    familia            text NOT NULL,
    subfamilia         text NOT NULL,
    UNIQUE (estudio_id, codigo)
);

-- ------------------------------------------------------------ estadistica --
-- Celda vacía = NULL, nunca 0: Mercer suprime según N° de compañías
-- (CL 2025: <=2 nada · 3 solo promedio · 4 + mediana · >=5 todo).
CREATE TABLE IF NOT EXISTS compensaciones.estadistica (
    puesto_id        int  NOT NULL REFERENCES compensaciones.puesto ON DELETE CASCADE,
    medida_codigo    text NOT NULL REFERENCES compensaciones.medida,
    n_companias      int,
    n_observaciones  int,
    p25              numeric,
    promedio         numeric,
    mediana          numeric,
    p75              numeric,
    PRIMARY KEY (puesto_id, medida_codigo)
);

-- ------------------------------------------------------------- puesto_vec --
-- Un vector por puesto (receta de MATCH, sin cambios). El match agrupa por
-- cargo_codigo con la mejor similitud de sus niveles. ~6.500 filas: sin índice
-- ivfflat, el scan exacto filtrado por estudio es suficiente.
CREATE TABLE IF NOT EXISTS compensaciones.puesto_vec (
    puesto_id  int PRIMARY KEY REFERENCES compensaciones.puesto ON DELETE CASCADE,
    embedding  vector(1536) NOT NULL,
    modelo     text NOT NULL               -- text-embedding-3-small
);

-- --------------------------------------------------------------- analisis --
-- Cada consulta del módulo. Se referencia por código Mercer (cargo_codigo),
-- no por puesto_id, para que sobreviva al estudio del año siguiente.
CREATE TABLE IF NOT EXISTS compensaciones.analisis (
    id               serial PRIMARY KEY,
    estudio_id       int  NOT NULL REFERENCES compensaciones.estudio,
    cargo_nombre     text NOT NULL,
    descriptor       text,
    candidatos       jsonb NOT NULL,        -- lo mostrado: [{cargo_codigo, similitud, score, justificacion}]
    cargos_elegidos  text[] NOT NULL DEFAULT '{}',
    nivel_codigo     text REFERENCES compensaciones.nivel,
    creado_por       text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------- v_mercado --
-- Puesto + estadística en formato largo; el módulo filtra por estudio, cargos,
-- nivel y medida. La subfamilia es la misma vista con es_core = true.
CREATE OR REPLACE VIEW compensaciones.v_mercado AS
SELECT p.estudio_id, p.codigo, p.cargo_codigo, p.subfamilia_codigo, p.es_core,
       p.nivel_codigo, p.titulo, p.familia, p.subfamilia,
       e.medida_codigo, e.n_companias, e.n_observaciones,
       e.p25, e.mediana, e.promedio, e.p75
FROM compensaciones.puesto p
JOIN compensaciones.estadistica e ON e.puesto_id = p.id;

-- ------------------------------------------------------------ alta módulo --
INSERT INTO app.modulos (codigo, nombre, descripcion, icono, ruta, orden, activo)
VALUES ('compensaciones', 'Compensaciones',
        'Compara un cargo con el mercado por nivel: sueldo base y compensación total',
        'query_stats', '/compensaciones', 100, TRUE)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO app.rol_modulos (rol_id, modulo_id)
SELECT r.id, m.id
FROM app.roles r, app.modulos m
WHERE r.nombre = 'admin' AND m.codigo = 'compensaciones'
ON CONFLICT DO NOTHING;
