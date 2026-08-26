-- migrations/014_calculadora_brasil_config.sql
-- Configuración Brasil de la calculadora: tramos INSS/IRRF 2026, reducción IRRF
-- 2026 (Ley 15.270/2025), cargas patronales, provisiones y bono empresa anual.
--
-- Idempotente y sólo UPDATE: la fila pais = 'brasil' ya existe, no se crea.
-- Los valores explícitos de esta migración mandan sobre lo que hubiera antes,
-- de modo que re-ejecutarla deja siempre el mismo estado conocido.
--

UPDATE calculadora.country_config
SET tasas = COALESCE(tasas, '{}'::jsonb)
    -- IRRF_DEDUCCION_DEPENDIENTE queda fuera del modelo: la calculadora es una
    -- estimación de compensaciones, no una liquidación personal.
    - 'IRRF_DEDUCCION_DEPENDIENTE'
    || jsonb_build_object(
      -- Cargas patronales directas
      'INSS_PATRONAL', 0.20,
      'RAT',           0.015,
      'RAT_FAP',       1.0,     -- multiplicador FAP sobre el RAT (0,5 a 2,0)
      'TERCEIROS',     0.058,
      'FGTS',          0.08,
      'MESES_ANIO',    12,

      -- Provisiones (divisores sobre el sueldo base mensual)
      'PROVISION_13_DIVISOR',         12,  -- 13º salario: 1/12 por mes
      'PROVISION_VACACIONES_DIVISOR', 12,  -- vacaciones: 1/12 por mes
      'ADICIONAL_VACACIONES_DIVISOR', 3,   -- adicional constitucional: 1/3

      -- Trabajador
      'SALARIO_MINIMO', 1621.00,
      'INSS_TRABAJADOR_TRAMOS', jsonb_build_array(
        jsonb_build_object('desde', 0.00,    'hasta', 1621.00, 'tasa', 0.075),
        jsonb_build_object('desde', 1621.00, 'hasta', 2902.84, 'tasa', 0.09),
        jsonb_build_object('desde', 2902.84, 'hasta', 4354.27, 'tasa', 0.12),
        jsonb_build_object('desde', 4354.27, 'hasta', 8475.55, 'tasa', 0.14)
      ),
      'INSS_TRABAJADOR_TOPE', 8475.55,

      'IRRF_DESCUENTO_SIMPLIFICADO', 607.20,
      'IRRF_TRAMOS', jsonb_build_array(
        jsonb_build_object('desde', 0.00,    'hasta', 2428.80, 'tasa', 0.00,  'rebaja', 0.00),
        jsonb_build_object('desde', 2428.80, 'hasta', 2826.65, 'tasa', 0.075, 'rebaja', 182.16),
        jsonb_build_object('desde', 2826.65, 'hasta', 3751.05, 'tasa', 0.15,  'rebaja', 394.16),
        jsonb_build_object('desde', 3751.05, 'hasta', 4664.68, 'tasa', 0.225, 'rebaja', 675.49),
        jsonb_build_object('desde', 4664.68, 'hasta', NULL,    'tasa', 0.275, 'rebaja', 908.73)
      ),

      -- Reducción IRRF 2026
      'IRRF_REDUCCION_LIMITE_TOTAL',   5000.00,
      'IRRF_REDUCCION_LIMITE_PARCIAL', 7350.00,
      'IRRF_REDUCCION_MAXIMA',         312.89,
      'IRRF_REDUCCION_CONSTANTE',      978.62,
      'IRRF_REDUCCION_FACTOR',         0.133145
    ),
    tasas_updated_at = NOW(),
    updated_at = NOW()
WHERE pais = 'brasil';

-- Bono empresa anual. `id` es la clave que consume el frontend.
UPDATE calculadora.country_config
SET bonos_empresa = jsonb_build_array(
      jsonb_build_object(
        'id',           'empresa_anual',
        'nombre',       'Bono empresa anual',
        'periodicidad', 'anual',
        'imponible',    true
      ),
      jsonb_build_object(
        'id',           'empresa_anual_no_imponible',
        'nombre',       'Bono empresa anual (no imponible)',
        'periodicidad', 'anual',
        'imponible',    false
      )
    ),
    updated_at = NOW()
WHERE pais = 'brasil';

-- Verificación
-- SELECT tasas, bonos_empresa FROM calculadora.country_config WHERE pais = 'brasil';
