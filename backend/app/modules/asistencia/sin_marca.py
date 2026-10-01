"""Reporte mensual inverso al de Inasistencias: trabajó, pero no hay torniquete.

Inasistencias pregunta "Buk dice que faltó, ¿marcó igual?". Acá la pregunta es
la contraria: "Buk no reporta nada raro, ¿pero pasó alguna vez por el
torniquete?". Un día con turno asignado, sin ausencia ni motivo cargado en Buk
y con cero marcas en Morpho es un día que nadie puede acreditar.

Las tres fuentes y el cruce son los mismos que usa `ausencias.py`; de ahí se
reutilizan los normalizadores para que la clave `rut|fecha` siga siendo una
sola en todo el módulo.

Cualquier fila de Inasistencias excluye el día, tenga o no motivo: permisos,
vacaciones, licencias y las ausencias puras ya las persigue la otra vista.
"""
from datetime import date, datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging_config import logger

from .ausencias import (
    _turnos,
    calendario_por_rut,
    fecha_iso,
    limpiar_rut,
    nombres_por_rut,
)
from .client import to_buk_date
from .config import AsistenciaSettings
from .morpho import clave, marcas_en_rango
from .recintos import filtrar_por_obra
from .service import exigir_configurado, get_por_obra, get_recintos

# Morpho deja de responder con rangos largos y el cálculo se hace por tramos
# cortos igual. El tope es explícito para que el error salga en la UI y no
# como un timeout a los dos minutos.
MAX_DIAS = 31


def dias_excluidos(inasistencias: list[dict]) -> dict[str, set[str]]:
    """rut -> días que Buk ya explica (ausencia, licencia, permiso, vacaciones)."""
    out: dict[str, set[str]] = {}
    for fila in inasistencias:
        rut = limpiar_rut(fila.get("DNI") or fila.get("dni"))
        if rut:
            out.setdefault(rut, set()).add(fecha_iso(fila))
    return out


def sin_marca(
    turnos: list[dict], inasistencias: list[dict], morpho: set[str]
) -> list[dict]:
    """Un registro por trabajador con al menos un día de turno sin marca."""
    excluidos = dias_excluidos(inasistencias)
    nombres = nombres_por_rut(turnos)
    out = []
    for rut, dias in sorted(calendario_por_rut(turnos).items()):
        exentos = excluidos.get(rut, set())
        faltantes = [
            d for d in dias if d not in exentos and clave(rut, d) not in morpho
        ]
        if not faltantes:
            continue
        exigibles = [d for d in dias if d not in exentos]
        out.append({
            "rut": rut,
            "nombre": nombres.get(rut, ""),
            "dias_exigibles": len(exigibles),
            "dias_sin_marca": len(faltantes),
            "fechas": faltantes,
        })
    return sorted(out, key=lambda r: (-r["dias_sin_marca"], r["rut"]))


async def detectar(
    settings: AsistenciaSettings,
    marcas_db: Session,
    desde: str,
    hasta: str,
    obra_id: str | None = None,
) -> list[dict]:
    """Días con turno y sin ninguna marca de torniquete en el rango."""
    if (date.fromisoformat(hasta) - date.fromisoformat(desde)).days + 1 > MAX_DIAS:
        raise ValueError(f"El rango no puede superar {MAX_DIAS} días (límite de Morpho).")
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

    morpho = marcas_en_rango(marcas_db, desde, hasta)
    encontrados = sin_marca(turnos, filas, morpho)
    logger.info(
        "[asistencia/sin-marca] %s..%s obra=%s: %d turnos, %d con días sin marca",
        desde, hasta, obra_id, len(turnos), len(encontrados),
    )
    return encontrados


def _demo() -> None:
    """python -m app.modules.asistencia.sin_marca"""
    turnos = [
        {"dni": "19117548-9", "nombreTrabajador": "Ana", "diaTurno": d,
         "horarioTurno": "08:00-17:00"}
        for d in ("28-08-2026", "31-08-2026", "01-09-2026")
    ]
    fila = lambda d, mot="-": {"DNI": "19117548-9", "ano": 2026, "mes": int(d[3:5]),
                               "dia": int(d[:2]), "Motivo": mot}

    # Sin ninguna marca: los tres días quedan sin acreditar.
    r = sin_marca(turnos, [], set())
    assert r[0]["dias_sin_marca"] == 3 and r[0]["dias_exigibles"] == 3, r

    # Una sola marca en el día basta para darlo por presente.
    r = sin_marca(turnos, [], {clave("19117548", "2026-08-31")})
    assert r[0]["fechas"] == ["2026-08-28", "2026-09-01"], r

    # Vacaciones cargadas en Buk: el día no se exige.
    r = sin_marca(turnos, [fila("28-08-2026", "Vacaciones")], set())
    assert r[0]["dias_sin_marca"] == 2 and r[0]["dias_exigibles"] == 2, r

    # Una ausencia sin motivo tampoco se exige acá: es la otra vista.
    r = sin_marca(turnos, [fila("28-08-2026")], set())
    assert r[0]["fechas"] == ["2026-08-31", "2026-09-01"], r

    # Todo marcado: no aparece en el reporte.
    todas = {clave("19117548", d) for d in ("2026-08-28", "2026-08-31", "2026-09-01")}
    assert sin_marca(turnos, [], todas) == []

    # Un día sin turno asignado no se exige.
    assert sin_marca(turnos[:1], [], {clave("19117548", "2026-08-28")}) == []
    # El rango se acota antes de salir a buscar datos.
    import asyncio
    try:
        asyncio.run(detectar(None, None, "2026-01-01", "2026-03-01"))
    except ValueError as e:
        assert "Morpho" in str(e), e
    else:
        raise AssertionError("rango largo debería fallar")

    print("ok")


if __name__ == "__main__":
    _demo()


# === Persistencia ===
# Morpho no aguanta rangos largos (ver MAX_DIAS), así que el mes no se calcula
# de una vez: se acumulan tramos cortos y el informe mensual lee lo guardado.

_BORRAR = text("""
    DELETE FROM app.asistencia_sin_marca
     WHERE fecha BETWEEN :desde AND :hasta
       AND (:obra_id = '' OR obra_id = :obra_id)
""")

_INSERTAR = text("""
    INSERT INTO app.asistencia_sin_marca (rut, fecha, nombre, obra_id, calculado_at)
    VALUES (:rut, :fecha, :nombre, :obra_id, :ts)
    ON CONFLICT (rut, fecha) DO UPDATE
       SET nombre = EXCLUDED.nombre,
           obra_id = EXCLUDED.obra_id,
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
    filas = [
        {"rut": r["rut"], "fecha": f, "nombre": r["nombre"], "obra_id": obra, "ts": ts}
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
    SELECT rut, nombre, fecha
      FROM app.asistencia_sin_marca
     WHERE fecha BETWEEN :desde AND :hasta
       AND (:obra_id = '' OR obra_id = :obra_id)
     ORDER BY rut, fecha
""")


def consultar(db: Session, desde: str, hasta: str, obra_id: str | None = None) -> list[dict]:
    """Lo ya calculado y guardado en el rango, agrupado por trabajador."""
    agrupado: dict[str, dict] = {}
    for rut, nombre, fecha in db.execute(
        _DETALLE, {"desde": desde, "hasta": hasta, "obra_id": obra_id or ""}
    ).all():
        reg = agrupado.setdefault(rut, {"rut": rut, "nombre": nombre or "", "fechas": []})
        if nombre:
            reg["nombre"] = nombre
        reg["fechas"].append(str(fecha)[:10])
    for reg in agrupado.values():
        reg["dias_sin_marca"] = len(reg["fechas"])
    return sorted(agrupado.values(), key=lambda r: (-r["dias_sin_marca"], r["rut"]))


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
