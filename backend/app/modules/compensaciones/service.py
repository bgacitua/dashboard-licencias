"""Lógica del módulo: match de un cargo, resultado de mercado y cálculo HAY. No escribe en BD."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.logging_config import logger

from . import ia
from . import repository as repo
from .config import settings

MEDIDAS = ("COMP1", "COMP3_REAL")


def _score(m: dict | None, similitud: float) -> tuple[float, str | None]:
    """Score de GPT para un candidato; si falta o no es número, coseno × 100."""
    try:
        return float(m["score"]), m.get("justificacion")
    except (TypeError, KeyError, ValueError):
        return similitud * 100, None


def match(db: Session, estudio_id: int, cargo_nombre: str, descriptor: str | None) -> dict:
    estudio = repo.get_estudio(db, estudio_id)
    if not estudio:
        raise HTTPException(404, "Estudio no encontrado")

    texto = f"Cargo: {cargo_nombre} | Descriptor: {descriptor}" if descriptor else f"Cargo: {cargo_nombre}"
    try:
        vector = ia.embedding(texto)
    except Exception as e:  # noqa: BLE001
        logger.error(f"[Compensaciones] Embedding falló ({type(e).__name__}): {e}")
        raise HTTPException(502, "No se pudo consultar el servicio de IA. Intenta de nuevo en unos minutos.")

    q = "[" + ",".join(str(v) for v in vector) + "]"
    candidatos = [dict(c) for c in repo.candidatos(db, estudio_id, q, settings.umbral, settings.candidatos)]

    matches = ia.puntuar(cargo_nombre, descriptor, candidatos, estudio["pais"]) if candidatos else []
    por_numero = {m.get("candidato_numero"): m for m in matches or []}
    for i, c in enumerate(candidatos, 1):
        c["score"], c["justificacion"] = _score(por_numero.get(i), c["similitud"])

    candidatos.sort(key=lambda c: c["score"], reverse=True)
    return {
        "fuente": "coseno" if matches is None else "gpt",
        "candidatos": candidatos[: settings.mostrar],
    }


def cargos_empresa(db: Session, estudio_id: int) -> list:
    if not repo.get_estudio(db, estudio_id):
        raise HTTPException(404, "Estudio no encontrado")
    return repo.cargos_empresa(db, estudio_id)


def resultado(db: Session, estudio_id: int, cargos: list[str], nivel: str) -> dict:
    estudio = repo.get_estudio(db, estudio_id)
    if not estudio:
        raise HTTPException(404, "Estudio no encontrado")

    cargos = list(dict.fromkeys(cargos))
    if nivel not in {n["codigo"] for n in repo.niveles(db, estudio_id, cargos)}:
        raise HTTPException(400, "El nivel no tiene datos para todos los cargos elegidos")

    detalle = [dict(d) for d in repo.detalle(db, estudio_id, nivel, cargos)]
    filas = [d for d in detalle if d["tipo"] == "cargo"]
    if len(cargos) > 1:
        for h in repo.hibrido(db, estudio_id, nivel, cargos):
            filas.append({
                **h, "tipo": "hibrido", "cargo_codigo": None,
                "titulo": f"Híbrido ({len(cargos)} cargos)",
                "n_companias": None, "n_observaciones": None,
            })
    subfamilias = [d for d in detalle if d["tipo"] == "subfamilia"]
    filas += subfamilias
    # Con cargos de más de una subfamilia: promedio simple entre ellas, con la
    # misma regla del híbrido (un estadístico solo si todas lo tienen).
    n_sub = len({d["cargo_codigo"] for d in subfamilias})
    if n_sub > 1:
        for medida in MEDIDAS:
            grupo = [d for d in subfamilias if d["medida_codigo"] == medida]
            if not grupo:
                continue
            filas.append({
                "tipo": "promedio_subfamilias", "cargo_codigo": None,
                "titulo": f"Promedio subfamilias ({n_sub})", "medida_codigo": medida,
                "n_companias": None, "n_observaciones": None,
                **{k: None if any(d[k] is None for d in grupo) else sum(d[k] for d in grupo) / len(grupo)
                   for k in ("p25", "mediana", "promedio", "p75")},
            })

    return {"moneda": estudio["moneda"], "factor_mensual": estudio["factor_mensual"], "filas": filas}


# ---------------------------------------------------------------- HAY
_tablas_hay: dict | None = None


def tablas_hay(db: Session) -> dict:
    """Tablas de referencia en memoria: tras recargarlas con `carga_hay.py referencias`, reiniciar el backend."""
    global _tablas_hay
    if _tablas_hay is None:
        t = repo.hay_tablas(db)
        if not all(t.values()):
            raise HTTPException(503, "Tablas HAY sin cargar")
        _tablas_hay = t
    return _tablas_hay


def calcular_hay(e: dict, t: dict) -> dict:
    """Puntos y grado HAY (misma lógica que la Calculadora.xlsx). 400 con el factor que falla."""
    kh = t["kh"].get((e["tecnica"], e["signo_tecnica"], e["gestion"], e["signo_gestion"], e["rrhh"]))
    if kh is None:
        raise HTTPException(400, "Know-How: combinación no válida")
    pct = t["sp_pct"].get((e["marco"], e["complejidad"], e["signo_complejidad"]))
    if pct is None:
        raise HTTPException(400, "Solución de problemas: combinación no válida")
    sp = t["sp_pts"].get((pct, kh))
    if sp is None:
        raise HTTPException(400, f"Solución de problemas: sin puntaje para {pct}% × {kh} KH")
    resp = t["resp"].get((e["libertad"], e["signo_libertad"], e["magnitud"], e["impacto"]))
    if resp is None:
        raise HTTPException(400, "Responsabilidad: combinación no válida (magnitud N va con impacto I–VI; 1–4 con R/C/S/P)")
    total = kh + sp + resp
    grado = next((g for g, mn, mx in t["grados"] if mn <= total <= mx), None)
    if grado is None:
        raise HTTPException(400, f"Total {total} fuera de la tabla de grados")
    return {"puntos_kh": kh, "porcentaje_sp": pct, "puntos_sp": sp, "puntos_resp": resp,
            "puntos_total": total, "grado": grado}
