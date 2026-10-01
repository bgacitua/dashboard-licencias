"""Presencialidad de quienes no están sujetos a marca.

Gerencias y KAM no tienen turno asignado ni marca en Buk Asistencia, así que el
informe con turno no los ve: su universo de días no existe en ninguna fuente.
Acá el universo se construye en vez de leerse.

    día hábil del mes  -  feriado  -  lo que Buk explica  =  día exigible
    día exigible sin marca en Morpho  =  día sin registro de acceso

La nómina sale de `rh.employees` filtrada por cargo. La lógica vive separada de
`sin_marca.py` a propósito: allá el día exigible lo dicta el turno y la
presencia la acredita Buk; acá no hay ninguna de las dos cosas y mezclarlas
solo haría que un cambio en una regla rompiera la otra en silencio.
"""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging_config import logger

from .client import to_buk_date
from .config import AsistenciaSettings
from .morpho import clave, marcas_en_rango
from .recintos import filtrar_por_obra
from .service import exigir_configurado, get_por_obra, get_recintos
from .sin_marca import MAX_DIAS, dias_excluidos, ultimo_dia_cerrado

GRUPO = "nomina"

# Cargos que se siguen por nómina, como patrones ILIKE.
#
# "%Gerente%" trae las 26 gerencias de la nómina e incluye las 11 subgerencias
# ("Subgerente De Calidad", "Subgerente de Ventas"…), porque la palabra está
# contenida: un patrón aparte para Subgerente sobra, y "Subgerente" sin
# comodines no calzaría con ninguno de los cargos reales.
#
# "Key Account Manager" sí existe tal cual. Ojo: los otros Manager de la nómina
# (Brand, Global Innovation, Market Responsible) quedan fuera a propósito.
CARGOS = ("%Gerente%", "Key Account Manager")

# Feriados legales de Chile con fecha fija conocida. Solo importan los que caen
# en día hábil; los de fin de semana se omiten porque ya no cuentan.
#
# ponytail: lista a mano y por año. Es una decena de fechas al año contra una
# tabla, un cargador y una fuente externa que igual habría que revisar. Un año
# sin cargar falla fuerte (ver `feriados_del_rango`) en vez de contar los
# feriados como días exigibles, que es el error caro.
#
# OJO: los feriados de elecciones se publican por ley cada ciclo y NO están
# acá. Al agregar un año hay que revisarlos.
FERIADOS: dict[int, tuple[str, ...]] = {
    2026: (
        "2026-01-01",  # Año Nuevo (jue)
        "2026-04-03",  # Viernes Santo
        "2026-05-01",  # Día del Trabajo (vie)
        "2026-05-21",  # Glorias Navales (jue)
        "2026-06-29",  # San Pedro y San Pablo (lun)
        "2026-07-16",  # Virgen del Carmen (jue)
        "2026-09-18",  # Independencia (vie)
        "2026-10-12",  # Encuentro de Dos Mundos (lun)
        "2026-12-08",  # Inmaculada Concepción (mar)
        "2026-12-25",  # Navidad (vie)
    ),
}


def feriados_del_rango(desde: str, hasta: str) -> set[str]:
    """Feriados entre ambas fechas. Revienta si falta el año: contar un feriado
    como día exigible manda a revisar a alguien que no tenía que venir."""
    años = range(int(desde[:4]), int(hasta[:4]) + 1)
    if (faltan := [a for a in años if a not in FERIADOS]):
        raise ValueError(
            f"No hay feriados cargados para {', '.join(map(str, faltan))}. "
            "Agregarlos en nomina.FERIADOS antes de calcular."
        )
    return {f for a in años for f in FERIADOS[a] if desde <= f <= hasta}


def dias_habiles(desde: str, hasta: str) -> list[str]:
    """Lunes a viernes del rango, sin feriados."""
    feriados = feriados_del_rango(desde, hasta)
    d, fin = date.fromisoformat(desde), date.fromisoformat(hasta)
    out = []
    while d <= fin:
        iso = d.isoformat()
        if d.weekday() < 5 and iso not in feriados:
            out.append(iso)
        d += timedelta(days=1)
    return out


# === Nómina ===

_NOMINA = text("""
    SELECT DISTINCT ON (rut) rut, nombre, cargo, jefe, area, recinto
      FROM (
        SELECT ltrim(left(regexp_replace(e.rut, '[^0-9kK]', '', 'g'), -1), '0') AS rut,
               COALESCE(e.full_name, '')        AS nombre,
               COALESCE(e.name_role, '')        AS cargo,
               COALESCE(j.full_name, '')        AS jefe,
               COALESCE(a.name, '')             AS area,
               COALESCE(e.recinto_primario, '') AS recinto,
               (e.status = 'activo')            AS vigente,
               e.id                             AS id
          FROM rh.employees e
          LEFT JOIN rh.employees j ON j.rut = e.rut_boss
          LEFT JOIN rh.areas a ON a.id = e.area_id
         WHERE e.status = 'activo'
           AND e.name_role ILIKE ANY(:cargos)
      ) t
     ORDER BY rut, vigente DESC, id DESC
""")


def nomina(db: Session, cargos: tuple[str, ...] = CARGOS) -> list[dict]:
    """Trabajadores vigentes cuyo cargo entra en el grupo seguido."""
    filas = [dict(f) for f in db.execute(_NOMINA, {"cargos": list(cargos)}).mappings()]
    logger.info("[asistencia/nomina] %d trabajadores en %d cargos", len(filas), len(cargos))
    return filas


def sin_registro(
    personas: list[dict],
    habiles: list[str],
    inasistencias: list[dict],
    morpho: set[str],
) -> list[dict]:
    """Un registro por persona con al menos un día hábil sin marca en Morpho."""
    excluidos = dias_excluidos(inasistencias)
    out = []
    for p in personas:
        rut = p["rut"]
        exentos = excluidos.get(rut, set())
        exigibles = [d for d in habiles if d not in exentos]
        faltantes = [d for d in exigibles if clave(rut, d) not in morpho]
        if not faltantes:
            continue
        out.append({
            **p,
            "dias_exigibles": len(exigibles),
            "dias_sin_torniquete": len(faltantes),
            "fechas": faltantes,
        })
    return sorted(out, key=lambda r: (-r["dias_sin_torniquete"], r["rut"]))


async def detectar(
    settings: AsistenciaSettings,
    db: Session,
    marcas_db: Session,
    desde: str,
    hasta: str,
    obra_id: str | None = None,
) -> list[dict]:
    """Días hábiles sin marca de torniquete de la nómina no sujeta a marca."""
    if (date.fromisoformat(hasta) - date.fromisoformat(desde)).days + 1 > MAX_DIAS:
        raise ValueError(f"El rango no puede superar {MAX_DIAS} días (límite de Morpho).")
    hasta = min(hasta, ultimo_dia_cerrado())
    if hasta < desde:
        return []
    exigir_configurado(settings)

    habiles = dias_habiles(desde, hasta)
    if not habiles:
        return []

    personas = nomina(db)
    if obra_id:
        mapa = await get_recintos().mapa()
        personas = [p for p in personas if mapa.get(p["rut"]) == obra_id]

    # Las licencias, permisos y vacaciones de esta gente se cargan en Buk igual
    # que las del resto: es la única fuente que dice que el día no se exige.
    params: dict[str, object] = {}
    if (d := to_buk_date(desde)):
        params["from"] = d
    if (h := to_buk_date(hasta)):
        params["to"] = h
    filas = await get_por_obra(settings.inasistencias_api_url, params, obra_id, settings)
    filas, _ = filtrar_por_obra(filas, await get_recintos().mapa(), obra_id)

    morpho = marcas_en_rango(marcas_db, desde, hasta)
    encontrados = sin_registro(personas, habiles, filas, morpho)
    logger.info(
        "[asistencia/nomina] %s..%s obra=%s: %d hábiles, %d personas, %d con días sin torniquete",
        desde, hasta, obra_id, len(habiles), len(personas), len(encontrados),
    )
    return encontrados


# === Persistencia ===
# Misma tabla que el informe con turno, separada por `grupo`: lo que cambia es
# cómo se arma el día exigible, no qué se guarda.

_BORRAR = text("""
    DELETE FROM app.asistencia_sin_marca
     WHERE fecha BETWEEN :desde AND :hasta
       AND grupo = :grupo
       AND (:obra_id = '' OR obra_id = :obra_id)
""")

_INSERTAR = text("""
    INSERT INTO app.asistencia_sin_marca
        (rut, fecha, grupo, nombre, obra_id, cargo, jefe, area, recinto, calculado_at)
    VALUES (:rut, :fecha, :grupo, :nombre, :obra_id, :cargo, :jefe, :area, :recinto, :ts)
    ON CONFLICT (rut, fecha) DO UPDATE
       SET grupo = EXCLUDED.grupo,
           nombre = EXCLUDED.nombre,
           obra_id = EXCLUDED.obra_id,
           cargo = EXCLUDED.cargo,
           jefe = EXCLUDED.jefe,
           area = EXCLUDED.area,
           recinto = EXCLUDED.recinto,
           calculado_at = EXCLUDED.calculado_at
""")


def guardar(
    db: Session, resultados: list[dict], desde: str, hasta: str, obra_id: str | None
) -> int:
    """Reemplaza el tramo del grupo. Devuelve los días almacenados."""
    obra = obra_id or ""
    ts = datetime.now(timezone.utc)
    filas = [
        {"rut": r["rut"], "fecha": f, "grupo": GRUPO, "nombre": r["nombre"],
         "obra_id": obra, "cargo": r["cargo"], "jefe": r["jefe"], "area": r["area"],
         "recinto": r["recinto"], "ts": ts}
        for r in resultados
        for f in r["fechas"]
    ]
    db.execute(_BORRAR, {"desde": desde, "hasta": hasta, "obra_id": obra, "grupo": GRUPO})
    if filas:
        db.execute(_INSERTAR, filas)
    db.commit()
    return len(filas)


def _demo() -> None:
    """python -m app.modules.asistencia.nomina"""
    # Hábiles: 18-09-2026 es feriado y cae viernes; el finde no cuenta.
    assert dias_habiles("2026-09-17", "2026-09-21") == ["2026-09-17", "2026-09-21"]
    # Un feriado en fin de semana no cambia nada (ya no era hábil).
    assert "2026-08-15" not in dias_habiles("2026-08-10", "2026-08-20")

    # Un año sin feriados cargados no se calcula a medias.
    try:
        dias_habiles("2030-01-01", "2030-01-31")
    except ValueError as e:
        assert "2030" in str(e), e
    else:
        raise AssertionError("un año sin feriados debería fallar")

    persona = {"rut": "19117548", "nombre": "Ana", "cargo": "Gerente de Planta",
               "jefe": "Luis", "area": "Comercial", "recinto": "Lucerna"}
    habiles = ["2026-09-21", "2026-09-22", "2026-09-23"]
    k = lambda d: clave("19117548", d)

    # Ningún día con marca: los tres quedan sin registro de acceso.
    r = sin_registro([persona], habiles, [], set())
    assert r[0]["dias_sin_torniquete"] == 3 and r[0]["dias_exigibles"] == 3, r
    # Los datos de la nómina viajan tal cual a la fila del informe.
    assert r[0]["cargo"] == "Gerente de Planta" and r[0]["jefe"] == "Luis", r[0]

    # Una marca salva el día.
    r = sin_registro([persona], habiles, [], {k("2026-09-22")})
    assert r[0]["fechas"] == ["2026-09-21", "2026-09-23"], r

    # Vacaciones cargadas en Buk: el día deja de ser exigible.
    vacaciones = [{"DNI": "19117548-9", "ano": 2026, "mes": 9, "dia": 21,
                   "Motivo": "Vacaciones"}]
    r = sin_registro([persona], habiles, vacaciones, set())
    assert r[0]["dias_exigibles"] == 2 and r[0]["fechas"] == ["2026-09-22", "2026-09-23"], r

    # Marcó todos los días hábiles: no aparece.
    assert sin_registro([persona], habiles, [], {k(d) for d in habiles}) == []
    print("ok")


if __name__ == "__main__":
    _demo()
