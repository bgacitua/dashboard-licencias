-- migrations/013_calculadora_peru_utilidades.sql
-- Factores del reparto de utilidades / asignación familiar / canasta navideña (Perú).
-- Se agregan a calculadora.country_config.tasas SIN pisar los valores ya cargados.
-- Ajustar CANASTA_NAVIDENA_MONTO y PORCENTAJE_UTILIDADES_SECTOR al valor real de la empresa.

UPDATE calculadora.country_config
SET tasas = jsonb_build_object(
      'SUELDOS_ANUALES',              14,      -- 12 sueldos + 2 gratificaciones
      'SUELDO_MINIMO',                1130,    -- RMV
      'ASIGNACION_FAMILIAR_PCT',      0.10,    -- 10% de la RMV
      'CANASTA_NAVIDENA_MONTO',       200,     -- monto anual por trabajador
      'BASE_DIAS_PROYECCION',         360,     -- año comercial completo
      'TOPE_UTILIDADES_MESES',        18,      -- tope legal: 18 remuneraciones mensuales
      'PORCENTAJE_UTILIDADES_SECTOR', 0.10     -- % de utilidades del sector
    ) || COALESCE(tasas, '{}'::jsonb),
    tasas_updated_at = NOW(),
    updated_at = NOW()
WHERE pais = 'peru';

-- Verificación
-- SELECT tasas FROM calculadora.country_config WHERE pais = 'peru';
