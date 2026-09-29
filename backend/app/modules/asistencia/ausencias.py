"""Ausencias en días consecutivos: detección, alerta por correo y job diario.

Una inasistencia suelta se corrige con una marca. Dos o más seguidas ya no son
un olvido de marcaje: o el trabajador dejó de venir, o hay una licencia que
nadie cargó. Esta es la única vista del módulo que persigue el segundo caso.

El ciclo es el mismo que hace la pestaña Inasistencias a mano:

    API Inasistencias -> Motivo "-" -> ¿sin marca Morpho? -> ¿días seguidos?

"Seguidos" se mide sobre los días con turno asignado, no sobre el calendario:
un viernes y un lunes son consecutivos si el fin de semana no había turno. Por
eso hace falta getAsignacionTurnos además de las otras dos fuentes.

La lógica vive acá y no en el navegador a propósito: el badge de la pestaña
consume este mismo endpoint. El cruce con Morpho ya está duplicado entre
`morpho.py` y `marcas.js` con la advertencia de que si divergen el cruce falla
en silencio; una segunda copia de la regla de racha no aporta nada.
"""
import re
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.logging_config import logger

from .client import to_buk_date
from .config import AsistenciaSettings, get_settings
from .morpho import clave, marcas_en_rango
from .recintos import filtrar_por_obra
from .service import exigir_configurado, get_client, get_por_obra, get_recintos

MINIMO_DIAS = 2  # ">1 día": una ausencia aislada no alerta


# === Normalización ===
# Réplica de `marcas.js:limpiarRut/fechaIso`, que es la que arma las claves con
# las que se compara el set de Morpho. `morpho.limpiar_employeeid` normaliza el
# EMPLOYEEID del reloj, que trae otra forma: no son intercambiables.


def limpiar_rut(valor) -> str:
    """RUT de Buk -> cuerpo sin puntos, sin DV y sin ceros a la izquierda."""
    v = str(valor or "").strip().replace(".", "")
    if "-" in v:
        cuerpo = v.split("-")[0]
    else:
        cuerpo = v[:-1] if len(v) > 1 else v
    return cuerpo.lstrip("0")


def fecha_iso(fila: dict) -> str:
    """yyyy-mm-dd desde los campos ano/mes/dia de una fila de Inasistencias."""
    return (
        f"{str(fila.get('ano') or '').zfill(4)}-"
        f"{str(fila.get('mes') or '').zfill(2)}-"
        f"{str(fila.get('dia') or '').zfill(2)}"
    )


_FECHAS = (
    (re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})"), (1, 2, 3)),
    (re.compile(r"^(\d{1,2})-(\d{1,2})-(\d{4})"), (3, 2, 1)),   # dd-mm-yyyy
    (re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})"), (3, 2, 1)),
    (re.compile(r"^(\d{4})/(\d{1,2})/(\d{1,2})"), (1, 2, 3)),
)


def a_iso(valor) -> str | None:
    """Fecha en cualquiera de los formatos que devuelven las APIs -> yyyy-mm-dd."""
    s = str(valor or "").strip()
    for patron, (a, m, d) in _FECHAS:
        if (g := patron.match(s)):
            return f"{g.group(a).zfill(4)}-{g.group(m).zfill(2)}-{g.group(d).zfill(2)}"
    return None


def tiene_turno(horario) -> bool:
    """"07:50-17:00" es turno; "", "-" y cualquier cosa ilegible no lo son."""
    if not isinstance(horario, str):
        return False
    partes = horario.strip().split("-")
    return len(partes) == 2 and all(
        re.match(r"^\d{1,2}:\d{2}", p.strip()) for p in partes
    )


def columna_motivo(rows: list[dict]) -> str:
    """El nombre exacto de la columna varía; el criterio es el mismo que la UI."""
    for k in dict.fromkeys(k for r in rows for k in r):
        if re.search(r"motivo", k, re.I):
            return k
    return ""


# === Detección de rachas ===


def calendario_por_rut(turnos: list[dict]) -> dict[str, list[str]]:
    """rut -> días con turno asignado, ordenados. Es la secuencia sobre la que
    se mide "consecutivo": los libres y los fines de semana no la cortan."""
    out: dict[str, set[str]] = {}
    for t in turnos:
        if not tiene_turno(t.get("horarioTurno")):
            continue
        if (f := a_iso(t.get("diaTurno"))):
            out.setdefault(limpiar_rut(t.get("dni")), set()).add(f)
    return {rut: sorted(dias) for rut, dias in out.items()}


def nombres_por_rut(turnos: list[dict]) -> dict[str, str]:
    """El nombre no viene en Inasistencias: se resuelve por RUT contra los turnos."""
    return {
        limpiar_rut(t.get("dni")): str(t.get("nombreTrabajador") or "")
        for t in turnos
        if t.get("nombreTrabajador")
    }


def rachas(
    inasistencias: list[dict],
    turnos: list[dict],
    morpho: set[str],
    minimo: int = MINIMO_DIAS,
) -> list[dict]:
    """Tramos de `minimo` o más días con turno seguidos, ausente y sin marcar.

    Un día con marca en Morpho corta la racha: hubo presencia, la inasistencia
    que reporta Buk es dudosa y se corrige por la vía normal.

    Una ausencia en un día que no aparece en el calendario de turnos se ignora:
    sin turno no se puede ubicar en la secuencia, y contarla como adyacente
    inventaría rachas que no existen.
    """
    motivo = columna_motivo(inasistencias)
    ausentes: dict[str, set[str]] = {}
    for fila in inasistencias:
        if motivo and str(fila.get(motivo) or "").strip() != "-":
            continue
        rut = limpiar_rut(fila.get("DNI") or fila.get("dni"))
        if rut:
            ausentes.setdefault(rut, set()).add(fecha_iso(fila))

    calendario = calendario_por_rut(turnos)
    nombres = nombres_por_rut(turnos)
    out = []
    for rut, dias_ausente in sorted(ausentes.items()):
        tramo: list[str] = []
        for dia in calendario.get(rut, []):
            if dia in dias_ausente and clave(rut, dia) not in morpho:
                tramo.append(dia)
                continue
            if len(tramo) >= minimo:
                out.append(_racha(rut, nombres.get(rut, ""), tramo))
            tramo = []
        if len(tramo) >= minimo:
            out.append(_racha(rut, nombres.get(rut, ""), tramo))
    return sorted(out, key=lambda r: (-r["dias"], r["rut"]))


def _racha(rut: str, nombre: str, fechas: list[str]) -> dict:
    return {
        "rut": rut,
        "nombre": nombre,
        "desde": fechas[0],
        "hasta": fechas[-1],
        "dias": len(fechas),
        "fechas": list(fechas),
        # Clave estable de la racha: mientras siga creciendo por el final, sigue
        # siendo la misma y no se re-alerta desde cero.
        "clave": f"{rut}|{fechas[0]}",
    }


# === Orquestación: las tres fuentes ===


async def _turnos(settings: AsistenciaSettings, desde: str, hasta: str) -> list[dict]:
    """getAsignacionTurnos espera el token como query param, no como header."""
    params: dict[str, object] = {"token": settings.external_api_key.get_secret_value()}
    if (d := to_buk_date(desde)):
        params["desde"] = d
    if (h := to_buk_date(hasta)):
        params["hasta"] = h
    return await get_client().get_array(settings.asignacion_turnos_api_url, params)


async def detectar(
    settings: AsistenciaSettings,
    marcas_db: Session,
    desde: str,
    hasta: str,
    obra_id: str | None = None,
) -> list[dict]:
    """Rachas de ausencias en el rango. Mismo camino que la pestaña, de una vez."""
    exigir_configurado(settings)
    params: dict[str, object] = {}
    if (d := to_buk_date(desde)):
        params["from"] = d
    if (h := to_buk_date(hasta)):
        params["to"] = h

    filas = await get_por_obra(settings.inasistencias_api_url, params, obra_id, settings)
    filas, _ = filtrar_por_obra(filas, await get_recintos().mapa(), obra_id)
    if not filas:
        return []

    turnos = await _turnos(settings, desde, hasta)
    # Fail-closed al revés de la pestaña: sin Morpho no se puede afirmar que
    # nadie marcó, y una alerta falsa manda a revisar a alguien que sí vino.
    morpho = marcas_en_rango(marcas_db, desde, hasta)
    encontradas = rachas(filas, turnos, morpho)
    logger.info(
        "[asistencia/ausencias] %s..%s obra=%s: %d inasistencias, %d rachas",
        desde, hasta, obra_id, len(filas), len(encontradas),
    )
    return encontradas


# === Anti-duplicado ===
# El job corre a diario sobre una ventana móvil, así que la misma racha aparece
# muchas veces. Se avisa cuando es nueva, y otra vez solo si creció.

_AVISADAS = text("SELECT clave, dias FROM app.asistencia_racha_avisada")

_UPSERT = text("""
    INSERT INTO app.asistencia_racha_avisada (clave, dias, ts)
    VALUES (:clave, :dias, :ts)
    ON CONFLICT (clave) DO UPDATE SET dias = EXCLUDED.dias, ts = EXCLUDED.ts
""")


def pendientes(db: Session, encontradas: list[dict]) -> list[dict]:
    """Las que nunca se avisaron, o las que sumaron días desde el último aviso."""
    previas = dict(db.execute(_AVISADAS).all())
    return [r for r in encontradas if r["dias"] > previas.get(r["clave"], 0)]


def marcar_avisadas(db: Session, avisadas: list[dict]) -> None:
    ts = datetime.now(timezone.utc)
    db.execute(_UPSERT, [{"clave": r["clave"], "dias": r["dias"], "ts": ts} for r in avisadas])
    db.commit()


# === Correo ===


def _dmy(iso: str) -> str:
    a, m, d = iso.split("-")
    return f"{d}-{m}-{a}"


def cuerpo_html(rachas_: list[dict], desde: str, hasta: str) -> str:
    filas = "".join(
        f"<tr><td>{r['rut']}</td><td>{r['nombre'] or '—'}</td>"
        f"<td align='center'><b>{r['dias']}</b></td>"
        f"<td>{_dmy(r['desde'])} → {_dmy(r['hasta'])}</td></tr>"
        for r in rachas_
    )
    return f"""
    <p>Ausencias en días consecutivos detectadas entre el {_dmy(desde)} y el {_dmy(hasta)}.</p>
    <p>Sin motivo registrado en Buk y sin marca en el reloj biométrico en
       ninguno de los días. Los días se cuentan sobre el turno asignado: un
       fin de semana sin turno no corta la racha.</p>
    <table border="1" cellpadding="6" cellspacing="0"
           style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      <tr style="background:#f3f4f6">
        <th align="left">RUT</th><th align="left">Nombre</th>
        <th>Días</th><th align="left">Periodo</th>
      </tr>
      {filas}
    </table>
    <p style="color:#6b7280;font-size:12px">
      Solo se avisan rachas nuevas o que sumaron días desde el último correo.
    </p>
    """


# === Job diario ===


def job_habilitado() -> bool:
    s = get_settings()
    return bool(s.enabled and s.ausencias_scheduler_enabled and s.ausencias_email)


def correr_job() -> dict:
    """Ventana móvil hacia atrás: Buk hace desaparecer las inasistencias ya
    justificadas, así que volver a mirar los días pasados corrige solo los
    avisos que hoy ya no corresponden."""
    import asyncio

    from app.db.session import SessionLocal
    from app.db.session_marcas import MarcasSessionLocal
    from app.services.email_service import send_email_graph

    settings = get_settings()
    hasta = date.today()
    desde = hasta - timedelta(days=settings.ausencias_ventana_dias)
    db, marcas_db = SessionLocal(), MarcasSessionLocal()
    try:
        encontradas = asyncio.run(
            detectar(settings, marcas_db, desde.isoformat(), hasta.isoformat())
        )
        nuevas = pendientes(db, encontradas)
        if not nuevas:
            logger.info("[asistencia/ausencias] %d rachas, ninguna nueva.", len(encontradas))
            return {"rachas": len(encontradas), "avisadas": 0}
        send_email_graph(
            to=settings.ausencias_email,
            cc="",
            subject=f"Ausencias en días consecutivos — {len(nuevas)} caso(s)",
            html_body=cuerpo_html(nuevas, desde.isoformat(), hasta.isoformat()),
        )
        marcar_avisadas(db, nuevas)
        logger.info("[asistencia/ausencias] avisadas %d de %d rachas.",
                    len(nuevas), len(encontradas))
        return {"rachas": len(encontradas), "avisadas": len(nuevas)}
    except Exception as exc:
        # Un job caído no puede tumbar el scheduler: el resto de las alertas de
        # la plataforma corren en el mismo proceso.
        logger.error("[asistencia/ausencias] job falló: %s", exc, exc_info=True)
        return {"error": str(exc)}
    finally:
        db.close()
        marcas_db.close()


def registrar_job(scheduler, tz) -> None:
    """Registra el job diario. Lo llama el scheduler de la plataforma."""
    from apscheduler.triggers.cron import CronTrigger

    s = get_settings()
    scheduler.add_job(
        correr_job,
        trigger=CronTrigger(hour=s.ausencias_scheduler_hour,
                            minute=s.ausencias_scheduler_minute, timezone=tz),
        id="asistencia_ausencias_job",
        name="Alerta de ausencias en días consecutivos",
        replace_existing=True,
    )
    logger.info(
        "[Scheduler] Job ausencias consecutivas registrado — %02d:%02d, ventana %d días → %s",
        s.ausencias_scheduler_hour, s.ausencias_scheduler_minute,
        s.ausencias_ventana_dias, s.ausencias_email,
    )


def _demo() -> None:
    """python -m app.modules.asistencia.ausencias"""
    assert limpiar_rut("19.117.548-9") == "19117548"
    # Sin guion, el ultimo digito es el DV: misma regla que marcas.js, y
    # distinta de morpho.limpiar_employeeid, que normaliza el EMPLOYEEID.
    assert limpiar_rut("0191175489") == "19117548"
    assert a_iso("25-08-2026") == "2026-08-25"
    assert a_iso("2026-08-25") == "2026-08-25"
    assert tiene_turno("07:50-17:00") and not tiene_turno("-") and not tiene_turno("")

    # Vie 28 y lun 31 son consecutivos: el fin de semana no tiene turno.
    turnos = [
        {"dni": "19117548-9", "nombreTrabajador": "Ana", "diaTurno": d, "horarioTurno": "08:00-17:00"}
        for d in ("28-08-2026", "31-08-2026", "01-09-2026")
    ]
    fila = lambda d, mot="-": {"DNI": "19117548-9", "ano": 2026, "mes": int(d[3:5]),
                               "dia": int(d[:2]), "Motivo": mot}

    r = rachas([fila("28-08-2026"), fila("31-08-2026")], turnos, set())
    assert [x["dias"] for x in r] == [2], r
    assert r[0]["clave"] == "19117548|2026-08-28"

    # Una marca en Morpho el 31 corta la racha: quedan dos días sueltos.
    marcado = {clave("19117548", "2026-08-31")}
    assert rachas([fila("28-08-2026"), fila("31-08-2026"), fila("01-09-2026")],
                  turnos, marcado) == []

    # Con motivo registrado no es una ausencia a perseguir.
    assert rachas([fila("28-08-2026"), fila("31-08-2026", "Licencia")], turnos, set()) == []

    # Un día suelto nunca alerta.
    assert rachas([fila("28-08-2026")], turnos, set()) == []

    # Tres seguidos son una sola racha de tres, no dos de dos.
    r = rachas([fila("28-08-2026"), fila("31-08-2026"), fila("01-09-2026")], turnos, set())
    assert len(r) == 1 and r[0]["dias"] == 3, r

    # Sin turno asignado la ausencia no se puede ubicar en la secuencia.
    assert rachas([fila("28-08-2026"), fila("29-08-2026")], turnos[:1], set()) == []
    print("ok")


if __name__ == "__main__":
    _demo()
