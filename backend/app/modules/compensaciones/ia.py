"""Llamadas a OpenAI con httpx (sin SDK). Prompt y parámetros iguales a MATCH
(vectorlib/matcher.py). Sin reintentos."""
import json

import httpx

from app.core.logging_config import logger

from .config import settings

PAISES = {"CL": "Chile", "PE": "Perú", "BR": "Brasil"}


def _post(ruta: str, payload: dict) -> dict:
    r = httpx.post(
        f"https://api.openai.com/v1/{ruta}",
        json=payload,
        timeout=settings.timeout,
        headers={"Authorization": f"Bearer {settings.openai_api_key.get_secret_value()}"},
    )
    r.raise_for_status()
    return r.json()


def embedding(texto: str) -> list[float]:
    data = _post("embeddings", {"model": settings.modelo_embedding, "input": texto})
    return data["data"][0]["embedding"]


def puntuar(cargo_nombre: str, descriptor: str | None, candidatos: list[dict], pais: str) -> list[dict] | None:
    """Score 0-100 por candidato. Devuelve None si GPT falla."""
    bloque = ""
    for i, c in enumerate(candidatos, 1):
        bloque += (
            f"\nCANDIDATO {i}:\n"
            f"Código: {c['cargo_codigo']}\n"
            f"Nombre: {c['titulo']}\n"
            f"Descriptor: {c['descripcion'] or 'N/A'}\n"
            f"Similitud vectorial: {c['similitud']:.2%}\n---"
        )

    prompt = f"""Eres experto en RRHH. Compara el cargo propio con cada candidato del catálogo de mercado de {PAISES.get(pais, pais)} y asigna un score 0-100.

CARGO PROPIO:
Nombre: {cargo_nombre}
Descriptor: {descriptor or 'N/A'}

CANDIDATOS:
{bloque}

Responde SOLO en JSON:
{{"matches": [{{"candidato_numero": 1, "codigo": "...", "score": 85, "justificacion": "..."}}]}}"""

    try:
        data = _post("chat/completions", {
            "model": settings.modelo_gpt,
            "messages": [
                {"role": "system", "content": "Analista de RRHH. Responde siempre en JSON válido."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        })
        return json.loads(data["choices"][0]["message"]["content"])["matches"]
    except Exception as e:  # noqa: BLE001 - cualquier falla cae al coseno
        logger.warning(f"[Compensaciones] Scoring GPT falló ({type(e).__name__}): {e}")
        return None
