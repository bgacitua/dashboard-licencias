-- =============================================================
-- Migración 026: catálogo de servicios y su historia de precios
-- Aplicar: psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/026_tickets_catalogo_servicios.sql
--
-- El servicio existe por sí solo y el formulario lo referencia por id
-- ('srv:<id>' en el value de la opción), no por el texto de la opción. Así
-- renombrarlo no rompe nada, el mismo servicio vale igual en todos los
-- formularios, y no quedan precios huérfanos.
--
-- El precio no es un campo que se pisa: es una fila con vigencia. Para saber
-- cuánto costaba algo en septiembre se lee la fila vigente en septiembre.
--
-- Se puede correr antes del deploy: nada lee estas tablas todavía.
-- =============================================================

BEGIN;

CREATE TABLE tickets.servicios (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(160) NOT NULL,
    descripcion TEXT,
    -- 'fijo' se cobra una vez; 'cantidad' se multiplica por la pregunta que
    -- el tipo marque como cantidad (un coffee se cobra por persona).
    modo        VARCHAR(20) NOT NULL DEFAULT 'fijo' CHECK (modo IN ('fijo', 'cantidad')),
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dos servicios activos con el mismo nombre son indistinguibles en el selector
-- del constructor. Uno dado de baja puede repetir el nombre del que lo sustituye.
CREATE UNIQUE INDEX servicios_nombre_activo ON tickets.servicios (lower(nombre))
    WHERE activo;

CREATE TABLE tickets.servicio_precios (
    id          SERIAL PRIMARY KEY,
    servicio_id INTEGER NOT NULL REFERENCES tickets.servicios(id) ON DELETE CASCADE,
    valor       NUMERIC(12, 2) NOT NULL CHECK (valor >= 0),
    desde       DATE NOT NULL,
    -- NULL = vigente sin fecha de término. 'hasta' es inclusivo.
    hasta       DATE,
    creado_por  VARCHAR(150),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (hasta IS NULL OR hasta >= desde)
);

CREATE INDEX servicio_precios_vigencia ON tickets.servicio_precios (servicio_id, desde DESC);

-- Un servicio no puede tener dos precios vigentes el mismo día: el cálculo del
-- costo elegiría uno al azar.
--
-- Lo natural acá sería un EXCLUDE con daterange, pero eso necesita btree_gist
-- para comparar el servicio_id con '=', y la extensión no está disponible en
-- este servidor. Un trigger da la misma garantía sin depender de contrib.
CREATE OR REPLACE FUNCTION tickets.servicio_precio_sin_solape()
RETURNS TRIGGER AS $$
BEGIN
    -- Sobre la fila del servicio, no sobre las de precios: dos altas
    -- simultáneas para el mismo servicio tienen que turnarse, o ambas leerían
    -- un estado sin solape y ambas insertarían.
    PERFORM 1 FROM tickets.servicios WHERE id = NEW.servicio_id FOR UPDATE;

    IF EXISTS (
        SELECT 1 FROM tickets.servicio_precios p
         WHERE p.servicio_id = NEW.servicio_id
           AND p.id IS DISTINCT FROM NEW.id
           AND daterange(p.desde, p.hasta, '[]') && daterange(NEW.desde, NEW.hasta, '[]')
    ) THEN
        RAISE EXCEPTION
            'El servicio % ya tiene un precio vigente en ese rango de fechas', NEW.servicio_id
            -- exclusion_violation: psycopg2 lo entrega como IntegrityError,
            -- que es lo que el service ya atrapa para responder 409.
            USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER servicio_precios_sin_solape
    BEFORE INSERT OR UPDATE OF servicio_id, desde, hasta ON tickets.servicio_precios
    FOR EACH ROW EXECUTE FUNCTION tickets.servicio_precio_sin_solape();

-- Cuál de las preguntas del formulario es la cantidad por la que se multiplican
-- los servicios 'cantidad'. Es el `name` de la pregunta dentro de `definicion`.
ALTER TABLE tickets.tipos ADD COLUMN pregunta_cantidad VARCHAR(80);

COMMIT;
