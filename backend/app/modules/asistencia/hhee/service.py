"""Reglas del submodulo de horas extras: default de semana y refresco manual.

Dos caminos, a proposito distintos:

- Lectura: va a `app.hhee_alertas` y nada mas. Nunca toca Buk, asi que la
  pantalla no depende de que el scraper este arriba.
- Refresco: llama por HTTP al contenedor `hhee-scrapping` en la red interna.
  Es lo unico sincronico, y solo se dispara si alguien aprieta el boton.
"""
from datetime import date, timedelta

import httpx

from app.core.logging_config import logger

from ..config import AsistenciaSettings

# El job del scraper corre lunes a viernes 08:00 y procesa la semana ISO
# anterior completa. La pantalla abre en esa misma semana: es lo que hay que
# revisar hoy.
def semana_anterior(hoy: date | None = None) -> tuple[date, date]:
    """(lunes, domingo) de la semana ISO anterior a `hoy`."""
    hoy = hoy or date.today()
    lunes_actual = hoy - timedelta(days=hoy.isoweekday() - 1)
    lunes = lunes_actual - timedelta(days=7)
    return lunes, lunes + timedelta(days=6)


def clave_semana(dia: date) -> str:
    """'2026-W36' para la semana ISO de `dia`."""
    anio, semana, _ = dia.isocalendar()
    return f"{anio}-W{semana:02d}"


def semana_iso_por_defecto(hoy: date | None = None) -> tuple[int, int]:
    """(anio_iso, semana_iso) de la semana anterior: el default de la pantalla.

    Se filtra por estas dos columnas y no por un rango de `clave_periodo`: la
    clave es texto y conviven dos formatos ('2026-09-02' y '2026-W36'), asi que
    un rango entre ambos no acota nada (la 'W' ordena despues de los digitos).
    """
    lunes, _ = semana_anterior(hoy)
    anio, semana, _ = lunes.isocalendar()
    return anio, semana


def exigir_configurado(settings: AsistenciaSettings) -> None:
    """503 si falta la URL o la key del scraper.

    Solo aplica al refresco manual: la lectura de la tabla no necesita ninguna
    de las dos. Degradar en vez de fallar al arrancar.
    """
    # Sin fallback a external_api_key a proposito: esa es el token de Buk Ctrl y
    # esta es la X-API-Key de un servicio propio. Reusarla mandaria la
    # credencial de Buk a otro servicio y ataria el refresco a su rotacion.
    if not (settings.hhee_api_url and settings.hhee_api_key.get_secret_value()):
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail="El servicio de horas extras no esta configurado "
                   "(ASISTENCIA_HHEE_API_URL / ASISTENCIA_HHEE_API_KEY).",
        )


def _llamar(settings: AsistenciaSettings, metodo: str, ruta: str, params: dict,
            aviso_timeout: str, timeout: float | None = None) -> dict:
    """Request al contenedor del scraper, con los errores ya traducidos.

    La API key se manda desde aca, nunca desde el navegador. Nunca se propaga el
    cuerpo de la respuesta del scraper: puede traer detalle interno.
    """
    exigir_configurado(settings)

    timeout = timeout or settings.hhee_timeout
    url = f"{settings.hhee_api_url.rstrip('/')}{ruta}"
    try:
        r = httpx.request(
            metodo, url, params=params, timeout=timeout,
            headers={"X-API-Key": settings.hhee_api_key.get_secret_value()},
        )
        r.raise_for_status()
        return r.json()
    except httpx.TimeoutException:
        logger.warning("[asistencia/hhee] %s excedio %ss", ruta, timeout)
        raise RuntimeError(aviso_timeout)
    except httpx.HTTPStatusError as exc:
        # El status del scraper, no su cuerpo: puede traer detalle interno.
        logger.error("[asistencia/hhee] %s -> HTTP %s", ruta, exc.response.status_code)
        if exc.response.status_code == 401:
            raise RuntimeError(
                "El scraper rechazo la API key: ASISTENCIA_HHEE_API_KEY tiene "
                "que ser igual a su HHEE_API_KEY."
            )
        raise RuntimeError(
            f"El scraper respondio HTTP {exc.response.status_code}. "
            "Revisar sus logs."
        )
    except httpx.HTTPError as exc:
        logger.error("[asistencia/hhee] %s fallo: %s", ruta, type(exc).__name__)
        raise RuntimeError("No se pudo contactar al servicio de horas extras.")


def refrescar(settings: AsistenciaSettings, desde=None, hasta=None,
              recintos: str = "") -> dict:
    """POST /hhee/sync al contenedor del scraper. Devuelve su resumen.

    Tarda ~12 s por recinto, de ahi el timeout largo. El scraper responde 200
    aunque un recinto falle: el detalle viene en el resumen, no en el status.
    """
    params = {}
    if desde:
        params["desde"] = str(desde)
    if hasta:
        params["hasta"] = str(hasta)
    if recintos:
        params["recintos"] = recintos

    return _llamar(
        settings, "POST", "/hhee/sync", params,
        "El scraper no respondio a tiempo. El barrido puede seguir corriendo: "
        "volve a consultar las alertas en un rato.",
    )


def historial(settings: AsistenciaSettings, desde, hasta, recinto: str = "",
              rut: str = "") -> dict:
    """GET /hhee/historial: aprobaciones de HHEE del rango, una fila por cambio de estado.

    A diferencia de las alertas, esto NO sale de `app.hhee_alertas`: el scraper
    consulta Buk en vivo, con un request por registro del listado. Es lento
    (minutos en rangos largos) y no se cachea, porque el dato que interesa acá
    es el de ahora, no el de la ultima corrida del job.
    """
    params = {"desde": str(desde), "hasta": str(hasta)}
    if recinto:
        params["recinto"] = recinto
    if rut:
        params["rut"] = rut

    return _llamar(
        settings, "GET", "/hhee/historial", params,
        "El scraper no respondio a tiempo. El reporte cuesta un request por "
        "registro: acotá el periodo, o filtrá por recinto o RUT.",
        timeout=settings.hhee_reporte_timeout,
    )
