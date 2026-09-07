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
    if not (settings.hhee_api_url and settings.hhee_api_key.get_secret_value()):
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail="El servicio de horas extras no esta configurado "
                   "(ASISTENCIA_HHEE_API_URL / ASISTENCIA_HHEE_API_KEY).",
        )


def refrescar(settings: AsistenciaSettings, desde=None, hasta=None,
              recintos: str = "") -> dict:
    """POST /hhee/sync al contenedor del scraper. Devuelve su resumen.

    Tarda ~12 s por recinto, de ahi el timeout largo. El scraper responde 200
    aunque un recinto falle: el detalle viene en el resumen, no en el status.
    """
    exigir_configurado(settings)

    params = {}
    if desde:
        params["desde"] = str(desde)
    if hasta:
        params["hasta"] = str(hasta)
    if recintos:
        params["recintos"] = recintos

    url = f"{settings.hhee_api_url.rstrip('/')}/hhee/sync"
    try:
        r = httpx.post(
            url, params=params, timeout=settings.hhee_timeout,
            headers={"X-API-Key": settings.hhee_api_key.get_secret_value()},
        )
        r.raise_for_status()
        return r.json()
    except httpx.TimeoutException:
        logger.warning("[asistencia/hhee] refresco excedio %ss", settings.hhee_timeout)
        raise RuntimeError(
            "El scraper no respondio a tiempo. El barrido puede seguir corriendo: "
            "volve a consultar las alertas en un rato."
        )
    except httpx.HTTPStatusError as exc:
        # El status del scraper, no su cuerpo: puede traer detalle interno.
        logger.error("[asistencia/hhee] refresco -> HTTP %s", exc.response.status_code)
        raise RuntimeError(
            f"El scraper respondio HTTP {exc.response.status_code}. "
            "Revisar su API key y sus logs."
        )
    except httpx.HTTPError as exc:
        logger.error("[asistencia/hhee] refresco fallo: %s", type(exc).__name__)
        raise RuntimeError("No se pudo contactar al servicio de horas extras.")
