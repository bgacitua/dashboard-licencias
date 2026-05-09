from datetime import datetime, timezone, timedelta
from typing import Any
from cachetools import TTLCache
from threading import Lock
from fastapi import HTTPException

from app.repositories.calculadora_repo import CalculadoraRepository
from app.schemas.calculadora import CountryConfigOut


# Umbrales de "stale" (días) — mismos que tenía el frontend antes
STALE_DAYS = {
    "uf": 2,
    "dolar": 2,
    "afp": 45,
    "tasas": 60,
    "tax_brackets": 30,
}

# Cache TTL en memoria (1h). Reemplaza el unstable_cache de Next.
_cache: TTLCache = TTLCache(maxsize=16, ttl=3600)
_cache_lock = Lock()

# Fallbacks mínimos por si la fila no existe o está toda nula.
# Si está vacío en BD, devolvemos 503 — preferimos error explícito antes que
# valores inventados que provoquen cálculos silenciosamente incorrectos.

PAISES_VALIDOS = {"chile", "peru", "brasil"}


def _is_stale(updated_at: datetime | None, threshold_days: int) -> bool:
    if updated_at is None:
        return True
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - updated_at > timedelta(days=threshold_days)


def _normalize_bonos_empresa(raw: list[dict] | None) -> list[dict]:
    if not raw:
        return []
    out = []
    for b in raw:
        nb = dict(b)
        if "tasa" in nb and nb["tasa"] is not None and not isinstance(nb["tasa"], list):
            nb["tasa"] = [nb["tasa"]]
        out.append(nb)
    return out


class CalculadoraService:
    def __init__(self, repo: CalculadoraRepository):
        self.repo = repo

    def get_country_config(self, pais: str) -> dict[str, Any]:
        if pais not in PAISES_VALIDOS:
            raise HTTPException(status_code=400, detail=f"País inválido: {pais}")

        with _cache_lock:
            if pais in _cache:
                return _cache[pais]

        row = self.repo.get_country_config(pais)
        if row is None:
            raise HTTPException(
                status_code=503,
                detail=f"No hay configuración cargada para {pais}",
            )

        warnings: list[str] = []

        if _is_stale(row.uf_updated_at, STALE_DAYS["uf"]):
            warnings.append("uf_value stale")
        if _is_stale(row.dolar_updated_at, STALE_DAYS["dolar"]):
            warnings.append("dolar_value stale")
        if _is_stale(row.afp_updated_at, STALE_DAYS["afp"]):
            warnings.append("afp_data stale")
        if _is_stale(row.tasas_updated_at, STALE_DAYS["tasas"]):
            warnings.append("tasas stale")
        if _is_stale(row.tax_brackets_updated_at, STALE_DAYS["tax_brackets"]):
            warnings.append("tax_brackets stale")

        payload = {
            "afpData": row.afp_data or {},
            "ufValue": float(row.uf_value) if row.uf_value is not None else 0.0,
            "dolarValue": float(row.dolar_value) if row.dolar_value is not None else 0.0,
            "taxBrackets": row.tax_brackets or [],
            "bonosAnualesUF": row.bonos_anuales_uf or {
                "navidad": 7, "escolaridad": 3, "fiestaPatrias": 6,
            },
            "bonosEmpresa": _normalize_bonos_empresa(row.bonos_empresa),
            "tasas": row.tasas or {},
            "_meta": {
                "pais": pais,
                "warnings": warnings,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            },
        }

        with _cache_lock:
            _cache[pais] = payload

        return payload

    @staticmethod
    def invalidate_cache(pais: str | None = None) -> None:
        with _cache_lock:
            if pais is None:
                _cache.clear()
            else:
                _cache.pop(pais, None)
