-- =============================================================
-- Migración 022: Módulo Tickets (portal de solicitudes + panel admin)
-- Aplicar: psql -d rh_cramer -f backend/migrations/022_create_tickets_module.sql
--
-- Todo con prefijo tk_ y fechas TIMESTAMPTZ: el plazo de edición se compara
-- contra NOW() y con TIMESTAMP sin zona el desfase contenedor/servidor lo
-- correría horas (ver la nota en formularios/repository.crear_token_envio).
-- =============================================================

-- Cuentas del portal. NO son usuarios de la plataforma (app.usuarios): viven
-- aparte para que el módulo se pueda separar y para que un token del portal no
-- abra nada fuera de él.
CREATE TABLE IF NOT EXISTS app.tk_usuarios (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(150) NOT NULL UNIQUE,   -- siempre en minúscula
    nombre          VARCHAR(200),
    rut             VARCHAR(20),
    -- NULL = sin clave: recién reseteada por el admin, a la espera de que la
    -- persona se vuelva a registrar antes de reset_hasta.
    password_hash   VARCHAR(200),
    estado          VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'activo', 'inactivo')),
    reset_hasta     TIMESTAMPTZ,
    activado_por    VARCHAR(150),
    activado_at     TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Tipos de solicitud (Desayunos, Almuerzos...). La definición es el JSON de
-- survey-core que arma el builder; el tema, el de applyTheme.
CREATE TABLE IF NOT EXISTS app.tk_tipos (
    id                  SERIAL PRIMARY KEY,
    slug                VARCHAR(80)  NOT NULL UNIQUE,
    nombre              VARCHAR(120) NOT NULL,
    descripcion         TEXT,
    portada_url         TEXT,
    definicion          JSONB        NOT NULL DEFAULT '{"pages":[]}'::jsonb,
    tema                JSONB,
    -- Plazo: se puede pedir o editar hasta `dias_anticipacion` días antes de
    -- la fecha del servicio a las `hora_limite`, hora de Chile.
    dias_anticipacion   INTEGER      NOT NULL DEFAULT 1 CHECK (dias_anticipacion >= 0),
    hora_limite         TIME         NOT NULL DEFAULT '12:00',
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    orden               INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- El id ES el número de ticket: no cambia al editar.
CREATE TABLE IF NOT EXISTS app.tk_tickets (
    id                   SERIAL PRIMARY KEY,
    tipo_id              INTEGER      NOT NULL REFERENCES app.tk_tipos(id),
    usuario_id           INTEGER      NOT NULL REFERENCES app.tk_usuarios(id),
    estado               VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                         CHECK (estado IN ('pendiente', 'en_curso', 'rechazado', 'cerrado')),
    fecha_servicio       DATE         NOT NULL,
    -- Se congela al crear o editar: cambiar la regla del tipo después no mueve
    -- el plazo de lo que ya se pidió.
    plazo                TIMESTAMPTZ  NOT NULL,
    version_actual       INTEGER      NOT NULL DEFAULT 1,
    -- version_actual > version_vista_admin = "modificado desde que lo viste".
    version_vista_admin  INTEGER      NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tk_tickets_usuario ON app.tk_tickets(usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tk_tickets_estado  ON app.tk_tickets(estado, fecha_servicio);

-- Cada envío o edición es una fila nueva; nunca un UPDATE.
CREATE TABLE IF NOT EXISTS app.tk_versiones (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER      NOT NULL REFERENCES app.tk_tickets(id) ON DELETE CASCADE,
    version         INTEGER      NOT NULL,
    fecha_servicio  DATE         NOT NULL,
    datos           JSONB        NOT NULL,
    ip              VARCHAR(64),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (ticket_id, version)
);

-- Cambios de estado y comentarios, del admin o del usuario.
CREATE TABLE IF NOT EXISTS app.tk_eventos (
    id              SERIAL PRIMARY KEY,
    ticket_id       INTEGER      NOT NULL REFERENCES app.tk_tickets(id) ON DELETE CASCADE,
    autor           VARCHAR(150) NOT NULL,
    es_admin        BOOLEAN      NOT NULL,
    estado_nuevo    VARCHAR(20),
    texto           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tk_eventos_ticket ON app.tk_eventos(ticket_id, created_at);

-- Imágenes que sube el admin para los formularios. En la base y no en disco:
-- entran en el backup y no hace falta montar un volumen.
CREATE TABLE IF NOT EXISTS app.tk_archivos (
    id              VARCHAR(32)  PRIMARY KEY,   -- token aleatorio: va en la URL pública
    nombre          VARCHAR(200),
    mime            VARCHAR(50)  NOT NULL,
    bytes           INTEGER      NOT NULL,
    datos           BYTEA        NOT NULL,
    subido_por      VARCHAR(150),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO app.modulos (codigo, nombre, descripcion, icono, ruta, orden, activo)
VALUES ('tickets', 'Tickets', 'Solicitudes de desayunos y almuerzos: panel de administración',
        'Ticket', '/tickets/admin', 95, TRUE)
ON CONFLICT (codigo) DO NOTHING;
