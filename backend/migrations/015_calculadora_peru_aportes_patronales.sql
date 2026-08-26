-- migrations/015_calculadora_peru_aportes_patronales.sql
-- Catálogo de aportes patronales de Perú (Eps, EsSalud, SCTR Salud,
-- SCTR Pensión y Vida Ley) en calculadora.country_config.tasas.
--
-- Son costo de empresa: no modifican el sueldo base, el líquido ni los
-- descuentos del trabajador. Sin este catálogo la calculadora aplica de forma
-- transitoria la regla histórica de EsSalud 9%.
--
-- Idempotente y sólo UPDATE: la fila pais = 'peru' ya existe. El valor
-- explícito manda sobre lo que hubiera antes, de modo que re-ejecutarla deja
-- siempre el mismo estado conocido.
--
-- Tipos admitidos por aporte:
--   porcentaje            → base × tasa
--   porcentaje_con_tope   → min(base, tope) × tasa
--   monto_fijo            → monto mensual
--
-- PENDIENTE DE VALIDAR CON NÓMINA: las tasas y topes de SCTR Pensión y Vida
-- Ley se derivaron de la muestra de abril 2026, no de una póliza. Ajustar aquí
-- (o directamente en la BD) cuando nómina confirme los valores contratados.

UPDATE calculadora.country_config
SET tasas = COALESCE(tasas, '{}'::jsonb) || jsonb_build_object(
      'APORTES_PATRONALES', jsonb_build_array(
        -- EPS y EsSalud van separados pero juntos son el 9% patronal de salud.
        jsonb_build_object(
          'id', 'eps', 'nombre', 'EPS',
          'tipo', 'porcentaje', 'tasa', 0.0225,
          'base', 'imponible', 'activo', true
        ),
        jsonb_build_object(
          'id', 'essalud', 'nombre', 'EsSalud',
          'tipo', 'porcentaje', 'tasa', 0.0675,
          'base', 'imponible', 'activo', true
        ),
        jsonb_build_object(
          'id', 'sctr_salud', 'nombre', 'SCTR Salud',
          'tipo', 'porcentaje', 'tasa', 0.007,
          'base', 'imponible', 'activo', true
        ),
        jsonb_build_object(
          'id', 'sctr_pension', 'nombre', 'SCTR Pensión',
          'tipo', 'porcentaje_con_tope', 'tasa', 0.007,
          'base', 'imponible', 'tope', 12598.57, 'activo', true
        ),
        jsonb_build_object(
          'id', 'vida_ley', 'nombre', 'Vida Ley',
          'tipo', 'porcentaje_con_tope', 'tasa', 0.0027,
          'base', 'imponible', 'tope', 12600, 'activo', true
        )
      )
    ),
    tasas_updated_at = NOW(),
    updated_at = NOW()
WHERE pais = 'peru';

-- Recordar invalidar la caché del backend tras aplicarla:
--   POST /api/v1/calculadora/config/peru/refresh   (rol admin)

-- Verificación
-- SELECT jsonb_pretty(tasas -> 'APORTES_PATRONALES')
-- FROM calculadora.country_config WHERE pais = 'peru';
