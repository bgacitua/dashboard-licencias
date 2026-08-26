"""Cliente de los endpoints externos Buk Ctrl.

El externo solo soporta paginación + filtro por rango de fechas (desde/hasta).
NO soporta orden/búsqueda/filtros por columna. Para ofrecer esas features sobre
TODO el conjunto, este cliente:
  - recorre todas las páginas del externo (concurrente),
  - cachea el dataset completo en memoria con TTL,
  - inyecta la API KEY en el header configurado,
  - traduce errores a HTTPException sin filtrar la KEY ni el host.

Contrato del externo (response):
  { "pagination": {"next","previous","count","page","totalPages"},
    "data": [ {...} ] }
"""
import asyncio
import time
from datetime import datetime

import httpx
from fastapi import HTTPException

from app.core.logging_config import logger

from .config import AsistenciaSettings



def to_buk_date(iso: str | None) -> str | None:
    """yyyy-mm-dd (HTML date input) → dd-mm-yyyy (lo que espera Buk)."""
    if not iso:
        return None
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%d-%m-%Y")
    except ValueError:
        raise HTTPException(status_code=400, detail="Fecha inválida (usar yyyy-mm-dd).")


class ExternalClient:
    def __init__(self, settings: AsistenciaSettings):
        self._settings = settings
        self._client = httpx.AsyncClient(
            timeout=settings.external_timeout,
            headers={
                settings.external_api_key_header: settings.external_api_key.get_secret_value(),
                "Accept": "application/json",
            },
        )
        # Caché: key (url|params) -> (timestamp, rows). Lock por key evita
        # recorridos duplicados ante requests concurrentes (cache stampede).
        self._cache: dict[str, tuple[float, list[dict]]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get_page(self, url: str, params: dict, headers: dict | None = None) -> dict:
        try:
            resp = await self._client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Timeout al consultar la fuente de datos.")
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            # Log server-side el detalle real (sin la KEY) para diagnóstico.
            logger.error("Buk respondió %s: %s", status, exc.response.text[:500])
            detail = (
                "Error de autenticación con la fuente."
                if status in (401, 403)
                else "La fuente de datos devolvió un error."
            )
            raise HTTPException(status_code=502, detail=detail)
        except (httpx.HTTPError, ValueError) as exc:
            logger.error("Fallo al contactar Buk: %r", exc)
            raise HTTPException(status_code=502, detail="No se pudo contactar la fuente de datos.")

    async def _crawl(self, url: str, base_params: dict, headers: dict | None = None) -> list[dict]:
        """Recorre todas las páginas del externo y junta los registros."""
        page_size = self._settings.crawl_page_size

        def page_params(page: int) -> dict:
            return {**base_params, "page": page, "page_size": page_size}

        first = await self._get_page(url, page_params(1), headers)
        rows: list[dict] = list(first.get("data", []))
        total_pages = int(first.get("pagination", {}).get("totalPages", 1) or 1)
        total_pages = min(total_pages, self._settings.crawl_max_pages)

        if total_pages <= 1:
            return rows

        sem = asyncio.Semaphore(self._settings.crawl_concurrency)

        async def fetch(page: int) -> list[dict]:
            async with sem:
                payload = await self._get_page(url, page_params(page), headers)
                return payload.get("data", [])

        pages = await asyncio.gather(*(fetch(p) for p in range(2, total_pages + 1)))
        for chunk in pages:
            rows.extend(chunk)
        return rows

    async def _crawl_next(self, url: str, base_params: dict, headers: dict | None = None) -> list[dict]:
        """Recorre un endpoint paginado por link `next` (API core de Buk).

        La API core no expone totalPages ni total_count, y el link `next` NO
        conserva page_size (vuelve al default de 25). Por eso paginamos por
        número nosotros, en lotes paralelos, hasta que una página venga corta.
        """
        page_size = self._settings.crawl_page_size
        lote = self._settings.crawl_concurrency

        async def fetch(page: int) -> list[dict]:
            payload = await self._get_page(
                url, {**base_params, "page": page, "page_size": page_size}, headers
            )
            return payload.get("data", [])

        rows: list[dict] = []
        # ponytail: lotes de `crawl_concurrency` páginas; una página corta = fin.
        # Puede pedir hasta lote-1 páginas vacías de más, sale gratis vs. secuencial.
        for inicio in range(1, self._settings.crawl_max_pages + 1, lote):
            chunks = await asyncio.gather(*(fetch(p) for p in range(inicio, inicio + lote)))
            for c in chunks:
                rows.extend(c)
            if any(len(c) < page_size for c in chunks):
                break
        logger.info("[crawl] %s: %d registros", url, len(rows))
        return rows

    async def _cached(self, key: str, fetch) -> list[dict]:
        """Memoiza `fetch()` bajo `key` con TTL, con lock anti-stampede."""
        ttl = self._settings.cache_ttl
        cached = self._cache.get(key)
        if cached and time.monotonic() - cached[0] < ttl:
            return cached[1]

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self._cache.get(key)  # re-check tras adquirir el lock
            if cached and time.monotonic() - cached[0] < ttl:
                return cached[1]
            rows = await fetch()
            self._cache[key] = (time.monotonic(), rows)
            return rows

    def _cache_key(self, url: str, base_params: dict) -> str:
        def norm(v: object) -> str:
            if isinstance(v, (list, tuple)):
                return ",".join(sorted(map(str, v)))
            return str(v)

        return url + "|" + "&".join(f"{k}={norm(base_params[k])}" for k in sorted(base_params))

    async def get_paged(
        self, url: str, base_params: dict, headers: dict | None = None
    ) -> list[dict]:
        """Dataset completo (cacheado) de cualquier endpoint Buk paginado.

        base_params se normaliza a una key de caché estable. Listas (p.ej.
        codigo_recinto múltiple) se serializan ordenadas. `headers` permite
        sobrescribir headers por request (p.ej. token en header 'token').
        """
        return await self._cached(
            self._cache_key(url, base_params),
            lambda: self._crawl(url, base_params, headers),
        )

    async def get_paged_next(
        self, url: str, base_params: dict, headers: dict | None = None
    ) -> list[dict]:
        """Igual que get_paged pero para endpoints paginados por link `next`."""
        return await self._cached(
            self._cache_key(url, base_params),
            lambda: self._crawl_next(url, base_params, headers),
        )

    async def get_array(
        self, url: str, params: dict, headers: dict | None = None
    ) -> list[dict]:
        """GET de un endpoint que devuelve un array JSON plano (sin paginación
        ni envoltura {data,pagination}), p.ej. getAsignacionTurnos. Sin caché."""
        data = await self._get_page(url, params, headers)
        if isinstance(data, list):
            return data
        return data.get("data", []) if isinstance(data, dict) else []

    def invalidate(self, url: str) -> None:
        """Drop all cache entries for url (any params). Called after commands."""
        for k in [k for k in self._cache if k.startswith(url)]:
            self._cache.pop(k, None)
            self._locks.pop(k, None)

    async def get_dataset(self, desde: str | None, hasta: str | None) -> list[dict]:
        """Dataset de asistencia-empresa para un rango de fechas (cacheado)."""
        params: dict[str, object] = {}
        buk_desde, buk_hasta = to_buk_date(desde), to_buk_date(hasta)
        if buk_desde:
            params["desde"] = buk_desde
        if buk_hasta:
            params["hasta"] = buk_hasta
        return await self.get_paged(self._settings.external_api_url, params)
