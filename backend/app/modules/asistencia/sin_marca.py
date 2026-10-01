"""Vino pero no pasó por el torniquete: quién, qué días.

Inasistencias pregunta "Buk dice que faltó, ¿marcó igual?". Acá la pregunta es
otra: la persona **sí vino** —Buk Asistencia registró su marca de entrada ese
día— y aun así no hay **ninguna** marca suya en Morpho.

    día con turno  +  sin fila en Inasistencias  +  marca en Buk  +  cero Morpho

Que no haya marca de ninguna clase no es un caso de este informe: eso es una
inasistencia y la persigue la otra pestaña. Por eso la marca de Buk es un
requisito, no un detalle: es lo que acredita que la persona estuvo.

Los días que Buk explica (licencia, permiso, vacaciones, ausencia) quedan fuera
con o sin motivo cargado.

Morpho no aguanta rangos largos, así que el mes no se calcula de una vez: se
acumulan tramos cortos y el informe mensual lee lo guardado. Jefe, área y
recinto se guardan junto con el día: el informe de un mes cerrado no debería
cambiar porque alguien cambió de jefatura en noviembre.
"""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging_config import logger

from .ausencias import (
    _turnos,
    a_iso,
    calendario_por_rut,
    fecha_iso,
    limpiar_rut,
    nombres_por_rut,
)
from .client import to_buk_date
from .config import AsistenciaSettings
from .morpho import clave, marcas_en_rango
from .recintos import filtrar_por_obra
from .service import exigir_configurado, get_marcajes, get_por_obra, get_recintos

# Morpho deja de responder con rangos largos y el cálculo se hace por tramos
# cortos igual. El tope es explícito para que el error salga en la UI y no
# como un timeout a los dos minutos.
MAX_DIAS = 31


def ultimo_dia_cerrado() -> str:
    """Ayer. Hoy aún no termina, así que no se puede afirmar que nadie marcó."""
    return (date.today() - timedelta(days=1)).isoformat()


def dias_excluidos(inasistencias: list[dict]) -> dict[str, set[str]]:
    """rut -> días que Buk ya explica (ausencia, licencia, permiso, vacaciones)."""
    out: dict[str, set[str]] = {}
    for fila in inasistencias:
        rut = limpiar_rut(fila.get("DNI") or fila.get("dni"))
        if rut:
            out.setdefault(rut, set()).add(fecha_iso(fila))
    return out


def presencia_buk(marcajes: list[dict], desde: str, hasta: str) -> set[str]:
    """Claves `rut|fecha` con marca de entrada en Buk Asistencia.

    Cada fila del dataset es una entrada registrada (no hay filas de turno sin
    marcar), así que la sola existencia de la fila acredita la presencia. El
    rango se vuelve a acotar acá: el dataset viene cacheado y puede traer días
    de más respecto a lo pedido.
    """
    out = set()
    for m in marcajes:
        rut = limpiar_rut(m.get("rut_trabajador"))
        f = a_iso(m.get("dia_entrada")) or a_iso(m.get("entrada_format"))
        if rut and f and desde <= f <= hasta:
            out.add(clave(rut, f))
    return out


def sin_marca(
    turnos: list[dict],
    inasistencias: list[dict],
    buk: set[str],
    morpho: set[str],
) -> list[dict]:
    """Un registro por trabajador con al menos un día presente y sin Morpho."""
    excluidos = dias_excluidos(inasistencias)
    nombres = nombres_por_rut(turnos)
    out = []
    for rut, dias in sorted(calendario_por_rut(turnos).items()):
        exentos = excluidos.get(rut, set())
        presentes = [
            d for d in dias if d not in exentos and clave(rut, d) in buk
        ]
        faltantes = [d for d in presentes if clave(rut, d) not in morpho]
        if not faltantes:
            continue
        out.append({
            "rut": rut,
            "nombre": nombres.get(rut, ""),
            # Denominador honesto: los días que la persona efectivamente vino,
            # no los que tenía turno. Sirve para leer "3 de 20" vs "20 de 20".
            "dias_presente": len(presentes),
            "dias_sin_torniquete": len(faltantes),
            "fechas": faltantes,
        })
    return sorted(out, key=lambda r: (-r["dias_sin_torniquete"], r["rut"]))


# === Datos de RH ===
# El cruce con Buk no trae jefe, área ni recinto: salen de rh.employees, que es
# la copia que la plataforma ya mantiene. DISTINCT ON porque un RUT puede tener
# varios contratos históricos y duplicaría la fila.

_RH = text("""
    SELECT DISTINCT ON (rut) rut, cargo, jefe, area, recinto
      FROM (
        SELECT ltrim(left(regexp_replace(e.rut, '[^0-9kK]', '', 'g'), -1), '0') AS rut,
               COALESCE(e.name_role, '')      AS cargo,
               COALESCE(j.full_name, '')      AS jefe,
               COALESCE(a.name, '')           AS area,
               COALESCE(e.recinto_primario, '') AS recinto,
               (e.status = 'activo')          AS vigente,
               e.id                           AS id
          FROM rh.employees e
          LEFT JOIN rh.employees j ON j.rut = e.rut_boss
          LEFT JOIN rh.areas a ON a.id = e.area_id
      ) t
     WHERE rut = ANY(:ruts)
     ORDER BY rut, vigente DESC, id DESC
""")


def datos_rh(db: Session, ruts: list[str]) -> dict[str, dict]:
    """rut -> {cargo, jefe, area, recinto}. Fail-open: el RUT que no esté queda vacío.

    `rh.employees` guarda el RUT como xx.xxx.xxx-x; acá las claves son el cuerpo
    sin DV ni ceros, igual que en el resto del módulo, así que la normalización
    va en el SQL (misma expresión que usa `notificaciones.jefaturas`).
    """
    if not ruts:
        return {}
    filas = db.execute(_RH, {"ruts": sorted(set(ruts))}).mappings().all()
    out = {f["rut"]: {"cargo": f["cargo"], "jefe": f["jefe"], "area": f["area"],
                      "recinto": f["recinto"]}
           for f in filas}
    logger.info("[asistencia/sin-marca] RH: %d de %d RUT resueltos", len(out), len(set(ruts)))
    return out


async def detectar(
    settings: AsistenciaSettings,
    marcas_db: Session,
    desde: str,
    hasta: str,
    obra_id: str | None = None,
) -> list[dict]:
    """Días en que Buk registró la entrada y Morpho no tiene ninguna marca."""
    if (date.fromisoformat(hasta) - date.fromisoformat(desde)).days + 1 > MAX_DIAS:
        raise ValueError(f"El rango no puede superar {MAX_DIAS} días (límite de Morpho).")
    # El día en curso no se puede juzgar: a media jornada el que todavía no pasa
    # por el torniquete no es un caso, y entraban cientos de falsos positivos.
    hasta = min(hasta, ultimo_dia_cerrado())
    if hasta < desde:
        return []
    exigir_configurado(settings)
    params: dict[str, object] = {}
    if (d := to_buk_date(desde)):
        params["from"] = d
    if (h := to_buk_date(hasta)):
        params["to"] = h

    filas = await get_por_obra(settings.inasistencias_api_url, params, obra_id, settings)
    filas, _ = filtrar_por_obra(filas, await get_recintos().mapa(), obra_id)

    turnos = await _turnos(settings, desde, hasta)
    if obra_id:
        # Los turnos no traen recinto: se acotan a los RUT que la obra dejó pasar
        # en el directorio, igual que hace `filtrar_por_obra` con las otras filas.
        permitidos = {
            limpiar_rut(r) for r, o in (await get_recintos().mapa()).items() if o == obra_id
        }
        turnos = [t for t in turnos if limpiar_rut(t.get("dni")) in permitidos]

    marcajes, _ = await get_marcajes(desde, hasta, obra_id)
    buk = presencia_buk(marcajes, desde, hasta)
    morpho = marcas_en_rango(marcas_db, desde, hasta)
    encontrados = sin_marca(turnos, filas, buk, morpho)
    logger.info(
        "[asistencia/sin-marca] %s..%s obra=%s: %d turnos, %d con días sin torniquete",
        desde, hasta, obra_id, len(turnos), len(encontrados),
    )
    return encontrados


# === Persistencia ===
# Morpho no aguanta rangos largos (ver MAX_DIAS), así que el mes no se calcula
# de una vez: se acumulan tramos cortos y el informe mensual lee lo guardado.

_BORRAR = text("""
    DELETE FROM app.asistencia_sin_marca
     WHERE fecha BETWEEN :desde AND :hasta
       AND (:obra_id = '' OR obra_id = :obra_id)
""")

_INSERTAR = text("""
    INSERT INTO app.asistencia_sin_marca
        (rut, fecha, nombre, obra_id, cargo, jefe, area, recinto, calculado_at)
    VALUES (:rut, :fecha, :nombre, :obra_id, :cargo, :jefe, :area, :recinto, :ts)
    ON CONFLICT (rut, fecha) DO UPDATE
       SET nombre = EXCLUDED.nombre,
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
    """Reemplaza el tramo completo. Devuelve los días almacenados.

    Borrar antes de insertar es lo que hace que recalcular corrija: un día que
    ya no corresponde (la licencia se cargó tarde) desaparece en vez de quedar
    pegado para siempre.
    """
    obra = obra_id or ""
    ts = datetime.now(timezone.utc)
    rh = datos_rh(db, [r["rut"] for r in resultados])
    vacio = {"cargo": "", "jefe": "", "area": "", "recinto": ""}
    filas = [
        {"rut": r["rut"], "fecha": f, "nombre": r["nombre"], "obra_id": obra, "ts": ts,
         **rh.get(r["rut"], vacio)}
        for r in resultados
        for f in r["fechas"]
    ]
    db.execute(_BORRAR, {"desde": desde, "hasta": hasta, "obra_id": obra})
    if filas:
        db.execute(_INSERTAR, filas)
    db.commit()
    return len(filas)


_TRAMOS = text("""
    SELECT MIN(fecha) AS desde, MAX(fecha) AS hasta, MAX(calculado_at) AS calculado_at,
           COUNT(*) AS dias, COUNT(DISTINCT rut) AS trabajadores
      FROM app.asistencia_sin_marca
     WHERE fecha BETWEEN :desde AND :hasta
""")

_DETALLE = text("""
    SELECT rut, nombre, cargo, jefe, area, recinto, fecha
      FROM app.asistencia_sin_marca
     WHERE fecha BETWEEN :desde AND :hasta
       AND (:obra_id = '' OR obra_id = :obra_id)
     ORDER BY rut, fecha
""")


def consultar(db: Session, desde: str, hasta: str, obra_id: str | None = None) -> list[dict]:
    """Lo ya calculado y guardado en el rango, agrupado por trabajador."""
    agrupado: dict[str, dict] = {}
    for f in db.execute(
        _DETALLE, {"desde": desde, "hasta": hasta, "obra_id": obra_id or ""}
    ).mappings():
        reg = agrupado.setdefault(f["rut"], {
            "rut": f["rut"], "nombre": "", "cargo": "", "jefe": "", "area": "",
            "recinto": "",
            "fechas": [],
        })
        # La última corrida manda: si un dato se resolvió vacío en un tramo y
        # con valor en otro, gana el que tiene valor.
        for campo in ("nombre", "cargo", "jefe", "area", "recinto"):
            if f[campo]:
                reg[campo] = f[campo]
        reg["fechas"].append(str(f["fecha"])[:10])
    for reg in agrupado.values():
        reg["dias_sin_torniquete"] = len(reg["fechas"])
    return sorted(agrupado.values(), key=lambda r: (-r["dias_sin_torniquete"], r["rut"]))


def cobertura(db: Session, desde: str, hasta: str) -> dict:
    """Qué parte del mes ya se calculó. El informe mensual no sirve si falta
    una semana, y desde la UI eso no se ve: una tabla con menos filas parece
    un buen mes."""
    fila = db.execute(_TRAMOS, {"desde": desde, "hasta": hasta}).one()
    return {
        "desde_calculado": str(fila.desde)[:10] if fila.desde else None,
        "hasta_calculado": str(fila.hasta)[:10] if fila.hasta else None,
        "calculado_at": fila.calculado_at.isoformat() if fila.calculado_at else None,
        "dias": fila.dias,
        "trabajadores": fila.trabajadores,
    }


def _demo() -> None:
    """python -m app.modules.asistencia.sin_marca"""
    turnos = [
        {"dni": "19117548-9", "nombreTrabajador": "Ana", "diaTurno": d,
         "horarioTurno": "08:00-17:00"}
        for d in ("28-08-2026", "31-08-2026", "01-09-2026")
    ]
    fila = lambda d, mot="-": {"DNI": "19117548-9", "ano": 2026, "mes": int(d[3:5]),
                               "dia": int(d[:2]), "Motivo": mot}
    k = lambda d: clave("19117548", d)
    DIAS = ["2026-08-28", "2026-08-31", "2026-09-01"]
    todo_buk = {k(d) for d in DIAS}

    # El rut del dataset viene sin puntos ni guión y la fecha como dd/mm/yyyy.
    assert presencia_buk(
        [{"rut_trabajador": "191175489", "dia_entrada": "28/08/2026"}],
        "2026-08-01", "2026-08-31",
    ) == {k("2026-08-28")}
    # El dataset viene cacheado y puede traer días fuera del rango pedido.
    assert presencia_buk(
        [{"rut_trabajador": "191175489", "dia_entrada": "01/09/2026"}],
        "2026-08-01", "2026-08-31",
    ) == set()

    # Vino los tres días según Buk y Morpho no tiene nada: el caso del informe.
    r = sin_marca(turnos, [], todo_buk, set())
    assert r[0]["dias_sin_torniquete"] == 3 and r[0]["dias_presente"] == 3, r

    # Sin marca de ninguna clase no es este informe, es una inasistencia.
    assert sin_marca(turnos, [], set(), set()) == []

    # Una marca en Morpho salva el día, aunque sea una sola.
    r = sin_marca(turnos, [], todo_buk, {k("2026-08-31")})
    assert r[0]["fechas"] == ["2026-08-28", "2026-09-01"], r

    # Vino solo un día: el denominador son los días presentes, no los de turno.
    r = sin_marca(turnos, [], {k("2026-08-28")}, set())
    assert r[0]["dias_presente"] == 1 and r[0]["fechas"] == ["2026-08-28"], r

    # Vacaciones cargadas en Buk: el día no se exige ni aunque haya marca.
    r = sin_marca(turnos, [fila("28-08-2026", "Vacaciones")], todo_buk, set())
    assert r[0]["dias_sin_torniquete"] == 2 and r[0]["dias_presente"] == 2, r

    # Todos los días con marca en Morpho: no aparece.
    assert sin_marca(turnos, [], todo_buk, todo_buk) == []

    # Un día sin turno asignado no se mira, aunque Buk tenga la entrada.
    assert sin_marca(turnos[:1], [], {k("2026-08-31")}, set()) == []

    # El día en curso nunca se exige, ni siquiera estando en el rango pedido.
    hoy = date.today().isoformat()
    assert ultimo_dia_cerrado() < hoy

    # El rango se acota antes de salir a buscar datos.
    import asyncio
    try:
        asyncio.run(detectar(None, None, "2026-01-01", "2026-03-01"))
    except ValueError as e:
        assert "Morpho" in str(e), e
    else:
        raise AssertionError("rango largo debería fallar")

    # Un tramo que empieza hoy no tiene días que juzgar: no sale a buscar nada
    # (settings=None reventaría si lo hiciera).
    assert asyncio.run(detectar(None, None, hoy, hoy)) == []
    print("ok")


if __name__ == "__main__":
    _demo()
