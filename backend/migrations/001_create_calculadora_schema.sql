-- migrations/001_create_calculadora_schema.sql
-- Replica 1:1 de public.country_config en Supabase, en schema calculadora.

CREATE SCHEMA IF NOT EXISTS calculadora;

CREATE TABLE IF NOT EXISTS calculadora.country_config (
  pais                    TEXT NOT NULL,
  afp_data                JSONB,
  afp_updated_at          TIMESTAMPTZ DEFAULT NOW(),
  uf_value                NUMERIC,
  uf_updated_at           TIMESTAMPTZ DEFAULT NOW(),
  tasas                   JSONB,
  tasas_updated_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  tax_brackets            JSONB,
  tax_brackets_updated_at TIMESTAMPTZ DEFAULT NOW(),
  dolar_value             NUMERIC,
  dolar_updated_at        TIMESTAMPTZ DEFAULT NOW(),
  bonos_anuales_uf        JSONB DEFAULT '{"navidad": 7, "escolaridad": 3, "fiestaPatrias": 6}'::jsonb,
  bonos_empresa           JSONB,

  CONSTRAINT country_config_pkey PRIMARY KEY (pais),
  CONSTRAINT country_config_pais_check
    CHECK (pais = ANY (ARRAY['chile'::text, 'peru'::text, 'brasil'::text])),
  CONSTRAINT country_config_afp_data_check
    CHECK (afp_data IS NULL OR jsonb_typeof(afp_data) = 'object'::text),
  CONSTRAINT country_config_tasas_check
    CHECK (tasas IS NULL OR jsonb_typeof(tasas) = 'object'::text),
  CONSTRAINT country_config_tax_brackets_check
    CHECK (tax_brackets IS NULL OR jsonb_typeof(tax_brackets) = 'array'::text),
  CONSTRAINT country_config_bonos_empresa_check
    CHECK (bonos_empresa IS NULL OR jsonb_typeof(bonos_empresa) = 'array'::text)
);

-- Permisos (ajustar nombres reales de los usuarios en rh_cramer)
-- GRANT USAGE ON SCHEMA calculadora TO dashboard_app;
-- GRANT SELECT ON calculadora.country_config TO dashboard_app;
-- GRANT USAGE ON SCHEMA calculadora TO n8n_writer;
-- GRANT SELECT, INSERT, UPDATE ON calculadora.country_config TO n8n_writer;

-- Registrar el módulo en el sistema de auth (tabla app.modulos del dashboard)
INSERT INTO app.modulos (codigo, nombre, descripcion, icono, ruta, orden, activo)
VALUES (
  'calculadora',
  'Calculadora de Sueldos',
  'Calculadora multi-país (Chile, Perú, Brasil) de sueldos, descuentos y costos patronales',
  'calculator',
  '/calculadora',
  50,
  TRUE
)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  icono = EXCLUDED.icono,
  ruta = EXCLUDED.ruta,
  orden = EXCLUDED.orden,
  activo = EXCLUDED.activo;

-- Asignar el módulo al rol admin para que sea inmediatamente accesible
-- (los demás roles se asignan desde el panel /admin)
INSERT INTO app.rol_modulos (rol_id, modulo_id)
SELECT r.id, m.id
FROM app.roles r, app.modulos m
WHERE r.nombre = 'admin' AND m.codigo = 'calculadora'
ON CONFLICT DO NOTHING;
