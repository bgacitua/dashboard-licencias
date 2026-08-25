"""Consultas del reporte de bono de asistencia. Solo lectura.

El proyecto original abría su propio Postgres por un túnel SSH con nueve
variables `reportes_pg_*` / `reportes_ssh_*`. La plataforma ya consulta estas
mismas tablas (`rh.consolidado_incidencias`, `rh.employees`), así que acá se usa
su sesión y el túnel desaparece.

Las quincenas se parametrizan: P1 = [q1_inicio, q2_inicio - 1], P2 = [q2_inicio, q2_fin].
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging_config import logger

# Incidencias por periodo, clasificadas en licencia/permiso/inasistencia, + datos
# del trabajador. Filtra por los cargos del bono y status activo.
_SQL = text("""
WITH rango AS (
    SELECT 1 AS periodo, CAST(:q1_inicio AS date) AS inicio, (CAST(:q2_inicio AS date) - 1) AS fin
    UNION ALL
    SELECT 2 AS periodo, CAST(:q2_inicio AS date) AS inicio, CAST(:q2_fin AS date) AS fin
),
incidencias_clasificadas AS (
    SELECT
        ci.employee_id,
        r.periodo,
        (LEAST(ci.end_date::DATE, r.fin) - GREATEST(ci.start_date::DATE, r.inicio)) + 1 AS dias,
        CASE
            WHEN ci.type_permission ILIKE ANY (ARRAY['%Licencia%', '%Enfermedad%', '%Accidente%', '%Patolog%', '%Prórroga%', '%Prorroga%'])
                THEN 'licencia'
            WHEN ci.type_permission ILIKE '%ausencia%'
                THEN 'inasistencia'
            ELSE 'permiso'
        END AS categoria
    FROM rh.consolidado_incidencias ci
    JOIN rango r
      ON ci.start_date::DATE <= r.fin
     AND ci.end_date::DATE   >= r.inicio
    WHERE ci.type_permission ILIKE ANY (ARRAY['%Enfermedad%', '%Licencia%', '%Accidente%', '%Ausencia%'])
      AND NOT (
            ci.type_permission IN (
                'permiso_por_horas', 'permiso_horas_cramer', 'permiso_matrimonio',
                'permiso_nacimiento', 'permiso_atencion_mutual', 'compensacion_de_horas',
                'permiso_por_enfermedad', 'permiso_por_capacitacion', 'permiso_examenes_preventivos'
            )
            OR (ci.type_permission IN ('permiso_con_goce', 'permiso') AND ci.day_percent = '0.5')
      )
),
ausencias_mes AS (
    SELECT
        employee_id,
        periodo,
        SUM(CASE WHEN categoria = 'licencia'     THEN dias ELSE 0 END) AS licencias,
        SUM(CASE WHEN categoria = 'permiso'      THEN dias ELSE 0 END) AS permisos,
        SUM(CASE WHEN categoria = 'inasistencia' THEN dias ELSE 0 END) AS inasistencias
    FROM incidencias_clasificadas
    GROUP BY employee_id, periodo
)
SELECT
    em.rut, em.full_name, em.name_role, em.active_since, em.cost_center, em.status,
    em.rut_boss, em2.full_name AS nombrejefe, a.name, a.first_level_name,
    COALESCE(am1.licencias, 0)     AS licencias_p1,
    COALESCE(am1.permisos, 0)      AS permisos_p1,
    COALESCE(am1.inasistencias, 0) AS inasistencias_p1,
    COALESCE(am2.licencias, 0)     AS licencias_p2,
    COALESCE(am2.permisos, 0)      AS permisos_p2,
    COALESCE(am2.inasistencias, 0) AS inasistencias_p2
FROM rh.employees AS em
LEFT JOIN rh.areas AS a ON em.area_id = a.id
LEFT JOIN rh.employees AS em2 ON em.rut_boss = em2.rut
LEFT JOIN ausencias_mes am1 ON em.id = am1.employee_id AND am1.periodo = 1
LEFT JOIN ausencias_mes am2 ON em.id = am2.employee_id AND am2.periodo = 2
WHERE em.name_role IN (
    'Auxiliar de Laboratorio', 'Operario de Lavandería', 'Analista De Control De Calidad',
    'Analista Control De Calidad Muestras', 'Analista De Microbiología', 'Asistente De Laboratorio',
    'Coordinadora Muestras', 'Inspector De Proceso', 'Administrativo Bodega Despacho',
    'Ayudante De Bodega', 'Asistente De Bodega', 'Chofer Administrativo Transporte', 'Chofer',
    'Coordinador de Planta', 'Encargado De Bodega Inflamables', 'Encargado De Bodega Materias Primas',
    'Operario', 'Operario Almacenamiento y Gestión de Residuos', 'Peoneta'
)
AND em.status = 'activo'
ORDER BY licencias_p1 DESC, permisos_p1 DESC, inasistencias_p1 DESC,
         licencias_p2 DESC, permisos_p2 DESC, inasistencias_p2 DESC
""")


# Detalle por-incidencia (una fila por incidencia × periodo). Para la hoja de
# auditoría "Ausencias". INNER JOIN -> solo empleados con incidencias.
_SQL_DETALLE = text("""
WITH rango AS (
    SELECT 1 AS periodo, CAST(:q1_inicio AS date) AS inicio, (CAST(:q2_inicio AS date) - 1) AS fin
    UNION ALL
    SELECT 2 AS periodo, CAST(:q2_inicio AS date) AS inicio, CAST(:q2_fin AS date) AS fin
)
SELECT
    em.rut, em.full_name, em.name_role, em.active_since, em.cost_center, em.status,
    a.first_level_name, r.periodo, ci.type_permission,
    CASE
        WHEN ci.type_permission ILIKE ANY (ARRAY['%Licencia%', '%Enfermedad%', '%Accidente%', '%Patolog%', '%Prórroga%', '%Prorroga%'])
            THEN 'licencia'
        WHEN ci.type_permission ILIKE '%ausencia%'
            THEN 'inasistencia'
        ELSE 'permiso'
    END AS categoria,
    ci.start_date::DATE AS fecha_inicio_incidencia,
    ci.end_date::DATE   AS fecha_fin_incidencia,
    ci.day_percent,
    GREATEST(ci.start_date::DATE, r.inicio) AS fecha_inicio_en_periodo,
    LEAST(ci.end_date::DATE, r.fin)         AS fecha_fin_en_periodo,
    (LEAST(ci.end_date::DATE, r.fin) - GREATEST(ci.start_date::DATE, r.inicio)) + 1 AS dias_en_periodo
FROM rh.consolidado_incidencias ci
JOIN rango r
  ON ci.start_date::DATE <= r.fin
 AND ci.end_date::DATE   >= r.inicio
JOIN rh.employees em ON ci.employee_id = em.id
LEFT JOIN rh.areas AS a ON em.area_id = a.id
WHERE ci.type_permission ILIKE ANY (ARRAY['%Enfermedad%', '%Licencia%', '%Accidente%', '%Ausencia%'])
  AND NOT (
        ci.type_permission IN (
            'permiso_por_horas', 'permiso_horas_cramer', 'permiso_matrimonio',
            'permiso_nacimiento', 'permiso_atencion_mutual', 'compensacion_de_horas',
            'permiso_por_enfermedad', 'permiso_por_capacitacion', 'permiso_examenes_preventivos'
        )
        OR (ci.type_permission IN ('permiso_con_goce', 'permiso') AND ci.day_percent = '0.5')
  )
  AND em.name_role IN (
        'Auxiliar de Laboratorio', 'Operario de Lavandería', 'Analista De Control De Calidad',
        'Analista Control De Calidad Muestras', 'Analista De Microbiología', 'Asistente De Laboratorio',
        'Coordinadora Muestras', 'Inspector De Proceso', 'Administrativo Bodega Despacho',
        'Ayudante De Bodega', 'Asistente De Bodega', 'Chofer Administrativo Transporte', 'Chofer',
        'Coordinador de Planta', 'Encargado De Bodega Inflamables', 'Encargado De Bodega Materias Primas',
        'Operario', 'Operario Almacenamiento y Gestión de Residuos', 'Peoneta'
  )
  AND em.status = 'activo'
ORDER BY em.full_name, r.periodo, ci.start_date
""")


# Permisos por horas en el rango completo (P1+P2), para cruzar contra el reporte de
# atrasos. Sin filtro de cargo/status: es una hoja de auditoría, mejor de más que de menos.
# ponytail: hoja temporal — cuando el cruce se haga en la BD, borrar esto y el SQL.
_SQL_PERMISOS_HORAS = text("""
SELECT em.rut, em.full_name, em.name_role,
       ci.type_permission, ci.day_percent,
       ci.start_date::DATE AS start_date,
       ci.end_date::DATE   AS end_date
FROM rh.consolidado_incidencias ci
JOIN rh.employees em ON ci.employee_id = em.id
WHERE ci.type_permission = 'permiso_por_horas'
  AND ci.start_date::DATE <= CAST(:q2_fin AS date)
  AND ci.end_date::DATE   >= CAST(:q1_inicio AS date)
ORDER BY em.full_name, ci.start_date
""")


class ReportesRepo:
    """Las tres consultas del reporte, sobre la sesión de la plataforma."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def _run(self, sql, **params) -> list[dict]:
        try:
            return [dict(r) for r in self._db.execute(sql, params).mappings()]
        except Exception as exc:
            # Sin repr de la excepción cruda: puede traer la cadena de conexión.
            logger.error("[asistencia/reportes] fallo consulta: %s", type(exc).__name__)
            raise RuntimeError("No se pudo consultar la base de reportes.")

    def query(self, q1_inicio: str, q2_inicio: str, q2_fin: str) -> list[dict]:
        return self._run(_SQL, q1_inicio=q1_inicio, q2_inicio=q2_inicio, q2_fin=q2_fin)

    def query_detalle(self, q1_inicio: str, q2_inicio: str, q2_fin: str) -> list[dict]:
        return self._run(_SQL_DETALLE, q1_inicio=q1_inicio, q2_inicio=q2_inicio, q2_fin=q2_fin)

    def query_permisos_horas(self, q1_inicio: str, q2_fin: str) -> list[dict]:
        return self._run(_SQL_PERMISOS_HORAS, q1_inicio=q1_inicio, q2_fin=q2_fin)
