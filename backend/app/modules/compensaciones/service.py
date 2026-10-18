"""Lógica del módulo: match de un cargo y resultado de mercado."""
import json

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


def match(db: Session, estudio_id: int, cargo_nombre: str, descriptor: str | None, usuario: str) -> dict:
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
    candidatos = candidatos[: settings.mostrar]

    analisis_id = repo.crear_analisis(
        db, estudio_id, cargo_nombre, descriptor, json.dumps(candidatos), usuario
    )
    return {
        "analisis_id": analisis_id,
        "fuente": "coseno" if matches is None else "gpt",
        "candidatos": candidatos,
    }


def resultado(db: Session, analisis_id: int, cargos: list[str], nivel: str) -> dict:
    analisis = repo.get_analisis(db, analisis_id)
    if not analisis:
        raise HTTPException(404, "Análisis no encontrado")
    estudio_id = analisis["estudio_id"]

    cargos = list(dict.fromkeys(cargos))
    if nivel not in {n["codigo"] for n in repo.niveles(db, estudio_id, cargos)}:
        raise HTTPException(400, "El nivel no tiene datos para todos los cargos elegidos")

    repo.elegir(db, analisis_id, cargos, nivel)
    estudio = repo.get_estudio(db, estudio_id)

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
