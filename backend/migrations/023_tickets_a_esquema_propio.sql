-- =============================================================
-- Migración 023: Módulo Tickets a su propio esquema
-- Aplicar: psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/023_tickets_a_esquema_propio.sql
--
-- La 022 creó las tablas como app.tk_*. El módulo va en un esquema `tickets`
-- para poder separarlo de la plataforma (pg_dump -n tickets, permisos propios).
-- Esta migración borra las app.tk_* y crea lo mismo en tickets.*.
--
-- Todo en una transacción: si algo falla, no queda nada a medias.
-- La fila 'tickets' de app.modulos NO se toca: es de la plataforma y sigue
-- siendo válida.
-- =============================================================

BEGIN;

-- Candado: si alguna tabla vieja tiene filas, se aborta. Así, si alguien ya
-- alcanzó a usarla, esta migración no borra datos de verdad.
DO $$
DECLARE
    t TEXT;
    n BIGINT;
BEGIN
    FOREACH t IN ARRAY ARRAY['tk_usuarios', 'tk_tipos', 'tk_tickets', 'tk_versiones', 'tk_eventos', 'tk_archivos']
    LOOP
        IF to_regclass('app.' || t) IS NOT NULL THEN
            EXECUTE format('SELECT count(*) FROM app.%I', t) INTO n;
            IF n > 0 THEN
                RAISE EXCEPTION 'app.% tiene % fila(s): no se borra. Revisar antes de migrar.', t, n;
            END IF;
        END IF;
    END LOOP;
END $$;

-- Hijas primero, sin CASCADE: si otra tabla ajena apuntara a estas, el DROP
-- falla en vez de llevársela por delante.
DROP TABLE IF EXISTS app.tk_versiones;
DROP TABLE IF EXISTS app.tk_eventos;
DROP TABLE IF EXISTS app.tk_tickets;
DROP TABLE IF EXISTS app.tk_tipos;
DROP TABLE IF EXISTS app.tk_usuarios;
DROP TABLE IF EXISTS app.tk_archivos;

CREATE SCHEMA IF NOT EXISTS tickets;

-- Mismas tablas que la 022, sin prefijo. Comentarios de diseño: ver la 022.
CREATE TABLE tickets.usuarios (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(150) NOT NULL UNIQUE,
    nombre          VARCHAR(200),
    rut             VARCHAR(20),
    password_hash   VARCHAR(200),
    estado          VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'activo', 'inactivo')),
    reset_hasta     TIMESTAMPTZ,
    activado_por    VARCHAR(150),
    activado_at     TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE tickets.tipos (
    id                  SERIAL PRIMARY KEY,
    slug                VARCHAR(80)  NOT NULL UNIQUE,
    nombre              VARCHAR(120) NOT NULL,
    descripcion         TEXT,
    portada_url         TEXT,
    definicion          JSONB        NOT NULL DEFAULT '{"pages":[]}'::jsonb,
    tema                JSONB,
    dias_anticipacion   INTEGER      NOT NULL DEFAULT 1 CHECK (dias_anticipacion >= 0),
    hora_limite         TIME         NOT NULL DEFAULT '12:00',
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    orden               INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE tickets.tickets (
    id                   SERIAL PRIMARY KEY,
    tipo_id              INTEGER      NOT NULL REFERENCES tickets.tipos(id),
    usuario_id           INTEGER      NOT NULL REFERENCES tickets.usuarios(id),
    estado               VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                         CHECK (estado IN ('pendiente', 'en_curso', 'rechazado', 'cerrado')),
    fecha_servicio       DATE         NOT NULL,
    plazo                TIMESTAMPTZ  NOT NULL,
    version_actual       INTEGER      NOT NULL DEFAULT 1,
    version_vista_admin  INTEGER      NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_usuario ON tickets.tickets(usuario_id, created_at DESC);
CREATE INDEX idx_tickets_estado  ON tickets.tickets(estado, fecha_servicio);

CREATE TABLE tickets.versiones (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER      NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
    version         INTEGER      NOT NULL,
    fecha_servicio  DATE         NOT NULL,
    datos           JSONB        NOT NULL,
    ip              VARCHAR(64),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (ticket_id, version)
);

CREATE TABLE tickets.eventos (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER      NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
    autor           VARCHAR(150) NOT NULL,
    es_admin        BOOLEAN      NOT NULL,
    estado_nuevo    VARCHAR(20),
    texto           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eventos_ticket ON tickets.eventos(ticket_id, created_at);

CREATE TABLE tickets.archivos (
    id              VARCHAR(32)  PRIMARY KEY,
    nombre          VARCHAR(200),
    mime            VARCHAR(50)  NOT NULL,
    bytes           INTEGER      NOT NULL,
    datos           BYTEA        NOT NULL,
    subido_por      VARCHAR(150),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMIT;
