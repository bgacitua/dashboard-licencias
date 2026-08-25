"""Camino de lectura: marcajes con el filtro global de recinto aplicado.

Los singletons viven acá y se crean de forma perezosa, no en el lifespan de la
plataforma: el módulo no toca `app/main.py`, y con el flag apagado nada de esto
llega a instanciarse.
"""
from asyncio import Semaphore, gather
from functools import lru_cache

from fastapi import HTTPException

from app.core.logging_config import logger

from .client import ExternalClient
from .config import AsistenciaSettings, get_settings
from .recintos import RecintoDirectory, clean_rut, filtrar_por_obra


@lru_cache
def get_client() -> ExternalClient:
    """Cliente httpx único del módulo (mantiene el pool y la caché con TTL)."""
    return ExternalClient(get_settings())


@lru_cache
def get_recintos() -> RecintoDirectory:
    return RecintoDirectory(get_client(), get_settings())


def exigir_configurado(settings: AsistenciaSettings) -> None:
    """503 si falta el token de Buk.

    Degradar en vez de fallar al arrancar: sin credencial el módulo queda
    inservible, pero el resto de la plataforma sigue en pie.
    """
    if not settings.external_api_key.get_secret_value():
        raise HTTPException(
            status_code=503,
            detail="Módulo de asistencia sin configurar (falta ASISTENCIA_EXTERNAL_API_KEY).",
        )


def filtrar_recinto_actual(rows: list[dict], actual: dict[str, str]) -> list[dict]:
    """Descarta los "recintos fantasma": filas de recintos a los que el trabajador
    ya no pertenece. Buk devuelve una fila por cada recinto histórico y todas se
    ven normales, así que el único discriminador es la asignación vigente.

    Fail-open: si no sabemos el recinto actual del trabajador (o el mapa viene
    vacío porque el endpoint falló) la fila se conserva. Nunca ocultar datos.
    """
    if not actual:
        return rows
    keep = []
    for r in rows:
        recinto = str(r.get("id_recinto") or "").strip()
        esperado = actual.get(clean_rut(r.get("rut_trabajador")))
        if recinto and esperado and recinto != esperado:
            continue
        keep.append(r)
    return keep


async def get_marcajes(
    desde: str | None, hasta: str | None, obra_id: str | None = None
) -> tuple[list[dict], int]:
    """(filas, descartadas). Descarta recintos fantasma y, con obra_id, todo
    trabajador que hoy no pertenezca a esa obra."""
    settings = get_settings()
    exigir_configurado(settings)
    rows = await get_client().get_dataset(desde, hasta)
    mapa = await get_recintos().mapa()
    antes = len(rows)
    rows = filtrar_recinto_actual(rows, mapa)
    fantasmas = antes - len(rows)
    rows, descartados = filtrar_por_obra(rows, mapa, obra_id, campos=("rut_trabajador",))
    if fantasmas or descartados:
        logger.info(
            "[asistencia] obra=%s: %d recintos fantasma, %d fuera de obra",
            obra_id, fantasmas, descartados,
        )
    return rows, descartados


async def get_por_obra(
    url: str,
    params: dict,
    obra_id: str | None,
    settings: AsistenciaSettings,
) -> list[dict]:
    """Consulta un endpoint de Buk que exige `obra_id`.

    Auditoría e inasistencias lo declaran obligatorio: sin él responden 400. Con
    "Todas" seleccionada no hay un obra_id que mandar, así que se consultan todas
    las obras configuradas en paralelo y se unen los resultados.

    Una obra que falle (id que no pertenece a la empresa, timeout) se omite con
    un warning en vez de tumbar la consulta completa: es preferible mostrar el
    resto de las obras a no mostrar nada.
    """
    if obra_id:
        return await get_client().get_paged(url, {**params, "obra_id": obra_id})

    obras = [o["id"] for o in settings.obras_list]
    if not obras:
        raise HTTPException(
            status_code=503,
            detail="Esta vista necesita al menos una obra configurada (ASISTENCIA_OBRAS).",
        )

    sem = Semaphore(settings.crawl_concurrency)

    async def una(oid: str) -> list[dict]:
        try:
            async with sem:
                return await get_client().get_paged(url, {**params, "obra_id": oid})
        except Exception as exc:
            logger.warning("[asistencia] obra %s omitida: %s", oid, exc)
            return []

    partes = await gather(*(una(o) for o in obras))
    return [fila for parte in partes for fila in parte]


def _demo() -> None:
    """python -m app.modules.asistencia.service — check del filtro de fantasmas."""
    from .recintos import recinto_actual

    actual = recinto_actual([
        {"dni": "12.006.327-8", "idRecinto": "36787"},
        {"dni": "12.006.327-8", "idRecinto": "36790"},  # asignación vieja, se ignora
    ])
    assert actual == {"120063278": "36787"}, actual

    rows = [
        {"rut_trabajador": "12006327-8", "id_recinto": "36787"},  # recinto actual
        {"rut_trabajador": "12006327-8", "id_recinto": "36790"},  # fantasma
        {"rut_trabajador": "99999999-9", "id_recinto": "36790"},  # sin asignación conocida
        {"rut_trabajador": "12006327-8"},                          # sin id_recinto
    ]
    keep = filtrar_recinto_actual(rows, actual)
    assert len(keep) == 3, keep
    assert not [r for r in keep
                if r.get("id_recinto") == "36790" and r["rut_trabajador"] == "12006327-8"]

    # endpoint caído => mapa vacío => nada se filtra
    assert filtrar_recinto_actual(rows, {}) == rows

    _demo_por_obra()
    print("ok")


def _demo_por_obra() -> None:
    """Sin obra elegida se consultan todas, y una obra caída no tumba el resto."""
    import asyncio

    # Se parchea sobre este mismo módulo: `python -m` lo carga como __main__ y
    # un `from . import service` traería una segunda copia con otro get_client.
    aqui = globals()

    llamadas: list[str] = []

    class _ClienteFalso:
        async def get_paged(self, _url, params):
            oid = params["obra_id"]
            llamadas.append(oid)
            if oid == "rota":
                raise RuntimeError("400")
            return [{"obra": oid}]

    class _SettingsFalsas:
        crawl_concurrency = 5
        obras_list = [{"id": "a"}, {"id": "rota"}, {"id": "b"}]

    original, aqui["get_client"] = get_client, lambda: _ClienteFalso()
    try:
        filas = asyncio.run(get_por_obra("u", {}, None, _SettingsFalsas()))
        assert sorted(llamadas) == ["a", "b", "rota"], llamadas
        assert sorted(f["obra"] for f in filas) == ["a", "b"], filas

        llamadas.clear()
        filas = asyncio.run(get_por_obra("u", {}, "b", _SettingsFalsas()))
        assert llamadas == ["b"] and filas == [{"obra": "b"}], (llamadas, filas)

        # Sin obras configuradas no hay nada que mandar: 503, no un 400 de Buk.
        class _SinObras(_SettingsFalsas):
            obras_list: list = []

        try:
            asyncio.run(get_por_obra("u", {}, None, _SinObras()))
            raise AssertionError("debía exigir obras configuradas")
        except HTTPException as exc:
            assert exc.status_code == 503, exc
    finally:
        aqui["get_client"] = original


if __name__ == "__main__":
    _demo()
