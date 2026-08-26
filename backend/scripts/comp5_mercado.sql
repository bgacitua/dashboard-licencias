-- ============================================================================
-- COMP5 / Comparación con estudio de mercado — Costo anual promedio por cargo
-- Fuente: costos.mv_costos_colaboradores (ya excluye DESCUENTO e INFORMATIVO)
-- Período: ene-2025 a dic-2025
--
-- Flujo de uso:
--   1) Correr QUERY 1 para ver TODOS los conceptos que entran al costo.
--   2) Decidir cuáles NO van en la comparación de mercado (ej. Hora Extra).
--   3) Pegar esos nombres EXACTOS en la lista de exclusión de QUERY 2.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- QUERY 1 — Inventario de items considerados en el costo (2025)
-- Sirve para "limpiar": muestra cada concepto con cuánto pesa, para que decidas
-- qué excluir (horas extras, asignaciones puntuales, bonos no comparables, etc.)
-- ----------------------------------------------------------------------------
SELECT
    item_type,
    income_type,
    concepto,
    COUNT(*)                       AS n_lineas,
    COUNT(DISTINCT rut)            AS n_personas,
    SUM(amount)                    AS monto_total_2025,
    ROUND(AVG(amount))             AS promedio_por_linea
FROM costos.mv_costos_colaboradores
WHERE pay_period BETWEEN DATE '2025-01-01' AND DATE '2025-12-31'
GROUP BY item_type, income_type, concepto
ORDER BY monto_total_2025 DESC;


-- ----------------------------------------------------------------------------
-- QUERY 2 — Costo anual promedio por cargo (COMP5), 2025
--
-- Lógica:
--   * Por persona: suma de TODOS sus amount en 2025 (= su remuneración total
--     anual) descontando los conceptos excluidos.
--   * Cuenta los meses con liquidación (meses_pagados) para poder anualizar
--     a quien no estuvo los 12 meses.
--   * Por cargo: promedia entre las personas.
--
-- Entrega dos métricas de promedio:
--   - costo_anual_promedio       -> promedio crudo de lo efectivamente pagado
--                                   (gente con <12 meses lo baja).
--   - costo_anualizado_promedio  -> cada persona escalada a equivalente 12 meses
--                                   (recomendado para comparar contra mercado).
--
-- AJUSTA aquí qué conceptos excluir (deben coincidir EXACTO con QUERY 1):
-- ----------------------------------------------------------------------------
WITH parametros AS (
    SELECT ARRAY[
        'Horas Extras 50%',
        'Indemnización Pactada Contractualmente',
        'Indemnización Legal Años De Servicio',
        'Indemnización Por Vacaciones',
        'Indemnización Sustitutiva Previo Aviso',
        'Liqui Difgrat 1 Sem',
        'Horas Extras 100%',
        'Asignación Sala Cuna',
        'Asignación Familiar',
        'Sobregiro',
        'Afp Prevision Empleador',
        'Complemento De Sueldo',
        'Vacaciones Progresivas',
        'Otros Imponibles',
        'Horas Extras 50% (mes anterior)',
        'Horas Extras 100% (mes anterior)',
        'Movilización Vendedores 2025',
        'Bono Llamado Emergencia',
        'Horas Extras 100% (transporte)',
        'Horas Extras 50% (Transporte)'
    ]::text[] AS conceptos_excluidos
),
por_persona AS (
    SELECT
        m.cargo,
        m.rut,
        MAX(m.full_name)                        AS full_name,
        COUNT(DISTINCT m.pay_period)            AS meses_pagados,
        SUM(m.amount)                           AS total_anual
    FROM costos.mv_costos_colaboradores m
    CROSS JOIN parametros p
    WHERE m.pay_period BETWEEN DATE '2025-01-01' AND DATE '2025-12-31'
      AND COALESCE(m.concepto, '') <> ALL (p.conceptos_excluidos)
      AND m.cargo IS NOT NULL
      -- Filtros opcionales de scope (descomentar y ajustar):
      -- AND m.empresa = 'NOMBRE EMPRESA'
      -- AND m.area    IN ('Area 1', 'Area 2')
    GROUP BY m.cargo, m.rut
)
SELECT
    cargo,
    COUNT(*)                                            AS n_personas,
    ROUND(AVG(meses_pagados), 1)                        AS meses_pagados_prom,
    -- Promedio de lo efectivamente pagado en el año
    ROUND(AVG(total_anual))                             AS costo_anual_promedio,
    -- Promedio anualizado (escala cada persona a 12 meses)
    ROUND(AVG(total_anual * 12.0 / NULLIF(meses_pagados, 0))) AS costo_anualizado_promedio,
    -- Referencias de dispersión
    ROUND(MIN(total_anual))                             AS minimo_anual,
    ROUND(MAX(total_anual))                             AS maximo_anual,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_anual)) AS mediana_anual
FROM por_persona
GROUP BY cargo
ORDER BY costo_anualizado_promedio DESC;


-- ----------------------------------------------------------------------------
-- QUERY 2b (opcional) — Detalle por persona de un cargo específico
-- Útil para auditar el promedio y detectar outliers antes de comparar.
-- ----------------------------------------------------------------------------
-- WITH parametros AS (
--     SELECT ARRAY[
--         'Horas Extras 50%','Indemnización Pactada Contractualmente',
--         'Indemnización Legal Años De Servicio','Indemnización Por Vacaciones',
--         'Indemnización Sustitutiva Previo Aviso','Liqui Difgrat 1 Sem',
--         'Horas Extras 100%','Asignación Sala Cuna','Asignación Familiar',
--         'Sobregiro','Afp Prevision Empleador','Complemento De Sueldo',
--         'Vacaciones Progresivas','Otros Imponibles',
--         'Horas Extras 50% (mes anterior)','Horas Extras 100% (mes anterior)',
--         'Movilización Vendedores 2025','Bono Llamado Emergencia',
--         'Horas Extras 100% (transporte)','Horas Extras 50% (Transporte)'
--     ]::text[] AS conceptos_excluidos
-- )
-- SELECT
--     m.rut,
--     MAX(m.full_name)             AS full_name,
--     COUNT(DISTINCT m.pay_period) AS meses_pagados,
--     SUM(m.amount)                AS total_anual,
--     ROUND(SUM(m.amount) * 12.0 / NULLIF(COUNT(DISTINCT m.pay_period), 0)) AS total_anualizado
-- FROM costos.mv_costos_colaboradores m
-- CROSS JOIN parametros p
-- WHERE m.pay_period BETWEEN DATE '2025-01-01' AND DATE '2025-12-31'
--   AND COALESCE(m.concepto, '') <> ALL (p.conceptos_excluidos)
--   AND m.cargo = 'NOMBRE DEL CARGO'
-- GROUP BY m.rut
-- ORDER BY total_anual DESC;
