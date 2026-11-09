-- ============================================================================
-- Compensaciones — bandas salariales internas (migración 039)
-- Idempotente. Replica la hoja "bandas" de CHILE.xlsx, en vivo sobre la dotación activa:
--   1. mediana del sueldo base por país y grado HAY del cargo (v_hay_vigente)
--   2. recta ln(mediana) = a + b·grado con los grados de ≥ 3 personas
--   3. midpoint = e^(a + b·grado); banda = 80%–120% del midpoint
-- Un grado sin personas dentro del rango igual tiene banda (sale de la recta).
-- ============================================================================

CREATE OR REPLACE VIEW compensaciones.v_banda AS
WITH g AS (
  SELECT d.pais, hv.grado, count(*) AS n_personas,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY d.base_wage) AS mediana_real
  FROM compensaciones.v_dotacion d
  JOIN compensaciones.v_hay_vigente hv ON hv.pais = d.pais AND hv.id_origen = d.role_id
  WHERE d.base_wage > 0
  GROUP BY d.pais, hv.grado
), r AS (
  SELECT pais, min(grado)::int AS desde, max(grado)::int AS hasta,
         regr_intercept(ln(mediana_real), grado) FILTER (WHERE n_personas >= 3) AS a,
         regr_slope(ln(mediana_real), grado)     FILTER (WHERE n_personas >= 3) AS b
  FROM g GROUP BY pais
)
SELECT r.pais, s.grado, COALESCE(g.n_personas, 0) AS n_personas, g.mediana_real,
       exp(r.a + r.b * s.grado) * 0.8 AS minimo,
       exp(r.a + r.b * s.grado)       AS midpoint,
       exp(r.a + r.b * s.grado) * 1.2 AS maximo
FROM r
CROSS JOIN LATERAL generate_series(r.desde, r.hasta) s(grado)
LEFT JOIN g ON g.pais = r.pais AND g.grado = s.grado
WHERE r.b IS NOT NULL;
