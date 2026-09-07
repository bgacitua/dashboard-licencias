"""Consultas de las alertas de horas extras. Solo lectura.

Las filas las escribe otro servicio (contenedor `hhee-scrapping`, repo
scrapping-hhee-reportes), que scrapea Buk/ctrlit y hace upsert en
`app.hhee_alertas`. Acá solo se lee: si ese servicio o Buk se caen, la pantalla
sigue mostrando el ultimo dato conocido, y `ultima_vez` dice de cuando es.

La tabla vive en el esquema `app`, que ya esta en el search_path de la
plataforma (`rh,app,public`). Se califica igual, explicito.

Clave de la tabla: (recinto, rut, tipo, clave_periodo). `tipo` es 'diario' o
'semanal'; `clave_periodo` es 'YYYY-MM-DD' para las diarias y 'YYYY-Www' para
las semanales.

Filtrar por semana va por `anio_iso`/`semana_iso`, que ambos tipos de fila
traen. NO por rango de `clave_periodo`: al ser texto y convivir los dos
formatos, 'W' > cualquier digito y un rango tipo
['2026-08-31', '2026-W36'] se come todas las alertas del anio.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging_config import logger

# Los filtros van con el patron "parametro nulo => no filtra", asi un solo SQL
# cubre todas las combinaciones sin armar strings.
_SQL = text("""
SELECT
    a.recinto,
    a.rut,
    COALESCE(NULLIF(TRIM(a.nombre), ''), em.full_name) AS nombre,
    em.name_role      AS cargo,
    em.cost_center    AS centro_costo,
    a.tipo,
    a.clave_periodo,
    a.anio_iso,
    a.semana_iso,
    a.horas::float    AS horas,
    a.tope::float     AS tope,
    (a.horas - a.tope)::float AS exceso,
    a.primera_vez,
    a.ultima_vez,
    a.veces_vista
FROM app.hhee_alertas a
LEFT JOIN rh.employees em ON em.rut = a.rut
-- CAST explicito en cada filtro opcional: sin el, un parametro que solo
-- aparece comparado contra NULL no tiene tipo inferible y Postgres rechaza la
-- consulta con AmbiguousParameter en cualquier driver de binding server-side.
WHERE (CAST(:recinto    AS text) IS NULL OR a.recinto    = CAST(:recinto    AS text))
  AND (CAST(:tipo       AS text) IS NULL OR a.tipo       = CAST(:tipo       AS text))
  AND (CAST(:rut        AS text) IS NULL OR a.rut        = CAST(:rut        AS text))
  AND (CAST(:anio_iso   AS int)  IS NULL OR a.anio_iso   = CAST(:anio_iso   AS int))
  AND (CAST(:semana_iso AS int)  IS NULL OR a.semana_iso = CAST(:semana_iso AS int))
  -- Rango explicito sobre clave_periodo: solo tiene sentido acotado a un
  -- `tipo`, porque los dos formatos de clave no son comparables entre si.
  AND (CAST(:desde      AS text) IS NULL OR a.clave_periodo >= CAST(:desde AS text))
  AND (CAST(:hasta      AS text) IS NULL OR a.clave_periodo <= CAST(:hasta AS text))
ORDER BY a.ultima_vez DESC, a.recinto, a.rut, a.tipo, a.clave_periodo
LIMIT CAST(:limite AS int)
""")

# Semanas ISO presentes en la tabla, para poblar el selector del frontend sin
# que tenga que adivinar rangos. Sirven las filas de los dos tipos: las diarias
# tambien traen anio_iso/semana_iso.
_SQL_SEMANAS = text("""
SELECT DISTINCT anio_iso, semana_iso
FROM app.hhee_alertas
WHERE anio_iso IS NOT NULL AND semana_iso IS NOT NULL
ORDER BY anio_iso DESC, semana_iso DESC
LIMIT 52
""")

# Cuando corrio por ultima vez el scraper, por recinto. Alimenta el
# "actualizado hace X" y delata un recinto que dejo de procesarse.
_SQL_FRESCURA = text("""
SELECT recinto, max(ultima_vez) AS ultima_vez, count(*) AS alertas
FROM app.hhee_alertas
GROUP BY recinto
ORDER BY recinto
""")


class HheeRepo:
    """Lecturas de app.hhee_alertas sobre la sesion de la plataforma."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def _run(self, sql, **params) -> list[dict]:
        try:
            return [dict(r) for r in self._db.execute(sql, params).mappings()]
        except Exception as exc:
            # Sin repr de la excepcion cruda: puede traer la cadena de conexion.
            logger.error("[asistencia/hhee] fallo consulta: %s", type(exc).__name__)
            raise RuntimeError("No se pudo consultar las alertas de horas extras.")

    def alertas(self, recinto=None, tipo=None, rut=None, anio_iso=None,
                semana_iso=None, desde=None, hasta=None, limite: int = 2000) -> list[dict]:
        return self._run(_SQL, recinto=recinto, tipo=tipo, rut=rut,
                         anio_iso=anio_iso, semana_iso=semana_iso,
                         desde=desde, hasta=hasta, limite=limite)

    def semanas(self) -> list[dict]:
        return self._run(_SQL_SEMANAS)

    def frescura(self) -> list[dict]:
        return self._run(_SQL_FRESCURA)
