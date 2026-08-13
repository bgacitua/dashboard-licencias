-- =============================================================
-- Migración 011: Módulo Créditos (préstamos a trabajadores)
-- Aplicar: psql -d rh_cramer -f backend/migrations/011_create_creditos_module.sql
-- =============================================================

CREATE TABLE IF NOT EXISTS app.creditos (
    id                  SERIAL PRIMARY KEY,
    employee_id         INTEGER      NOT NULL,
    rut                 VARCHAR(20),
    nombre_trabajador   VARCHAR(200),

    -- Datos del crédito (POST /credits/create)
    nombre              VARCHAR(200) NOT NULL,
    tipo                VARCHAR(50)  NOT NULL DEFAULT 'credito_personal',
    start_date          DATE         NOT NULL,
    moneda              VARCHAR(10)  NOT NULL DEFAULT 'peso',
    amount              INTEGER      NOT NULL,
    cuota_actual        INTEGER      NOT NULL DEFAULT 1,
    duracion            INTEGER      NOT NULL,

    -- Montos del comprobante de préstamo (los ingresa RRHH)
    monto_original      NUMERIC(12, 2),
    equivalente_pesos   BIGINT,
    comentario          TEXT,
    dia_uf              VARCHAR(2),

    -- Flujo documento/firma
    buk_file_id         INTEGER,
    buk_credit_id       INTEGER,
    estado              VARCHAR(30)  NOT NULL DEFAULT 'borrador',
    firmas_requeridas   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    firmas_estado       JSONB,

    created_by          VARCHAR(150),
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creditos_employee ON app.creditos (employee_id);
CREATE INDEX IF NOT EXISTS idx_creditos_estado   ON app.creditos (estado);

-- Registro del módulo (sin esto no aparece en el menú)
INSERT INTO app.modulos (codigo, nombre, descripcion, icono, ruta, orden, activo)
VALUES (
    'creditos',
    'Créditos',
    'Otorgamiento de créditos y préstamos a trabajadores con firma de pagaré en BUK',
    'payments',
    '/creditos',
    75,
    TRUE
)
ON CONFLICT (codigo) DO UPDATE SET
    nombre      = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    icono       = EXCLUDED.icono,
    ruta        = EXCLUDED.ruta,
    orden       = EXCLUDED.orden,
    activo      = EXCLUDED.activo;

INSERT INTO app.rol_modulos (rol_id, modulo_id)
SELECT r.id, m.id
FROM app.roles r, app.modulos m
WHERE r.nombre IN ('admin', 'rrhh') AND m.codigo = 'creditos'
ON CONFLICT DO NOTHING;
