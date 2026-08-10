"""
Renovación de contratos en BUK vía navegador (Playwright).

Se usa en lugar del PATCH a la API: la UI de BUK aplica las reglas de negocio
del flujo de renovación, por lo que es la vía segura mientras el PATCH está
deshabilitado.
"""
import logging
import threading
from contextlib import contextmanager

from app.core.config import settings

logger = logging.getLogger(__name__)

LOGIN_URL = "/users/sign_in"
TIPO_LABEL = {"indefinido": "Indefinido", "plazo_fijo": "Plazo Fijo"}


# ponytail: lock global en vez de cola. Evita dos sesiones BUK simultáneas
# (respuesta automática + click manual al mismo tiempo). Si aparece renovación
# masiva o más de una réplica del backend, esto se queda corto y corresponde
# una cola real (tabla de jobs + worker) con estado async en la UI.
_lock = threading.Lock()


class BukScraperError(Exception):
    pass


@contextmanager
def _browser():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=settings.BUK_WEB_HEADLESS)
        try:
            yield browser.new_context(viewport={"width": 1440, "height": 900})
        finally:
            browser.close()


def _login(page):
    page.goto(f"{settings.BUK_WEB_BASE_URL}{LOGIN_URL}", wait_until="domcontentloaded")
    page.fill("#user_email", settings.BUK_WEB_USER)
    page.click("input[type=submit][value='Siguiente']")
    page.wait_for_selector("#user_password", timeout=15000)
    page.fill("#user_password", settings.BUK_WEB_PASSWORD)
    page.click("input[type=submit][value='Iniciar Sesión']")
    # ponytail: nada de networkidle, BUK deja conexiones abiertas y nunca queda
    # ocioso. Se espera a que la URL deje de ser la de login.
    page.wait_for_url(lambda url: "/users/sign_in" not in url, timeout=30000)


# Botón de cerrar del modal, acotado al header: la ficha tiene muchos otros
# `data-name-icon` (content_copy, keyboard_arrow_left) que no cierran nada.
_CERRAR_POPUP = (
    ".modal-header button.close[data-dismiss='modal'], "
    ".modal-header button:has([data-name-icon='close'])"
)

# BUK bloquea la plataforma por facturas impagas con un modal igual a los demás.
# Se detecta por texto para no confundirlo con un aviso inocuo.
_TEXTO_BLOQUEO = "restringió tu acceso"


def _hay_bloqueo_facturacion(page) -> bool:
    """True si el modal visible es el de acceso restringido por deuda."""
    try:
        modal = page.locator(".modal-content:visible").first
        if modal.count() == 0:
            return False
        return _TEXTO_BLOQUEO in modal.inner_text(timeout=2000)
    except Exception:
        return False


def _cerrar_popups(page, intentos: int = 3) -> int:
    """Cierra los modales que BUK abre al entrar a la ficha. Devuelve cuántos cerró.

    Tolerante a propósito: si no hay popup no pasa nada. El problema real es que
    el overlay intercepta los clicks siguientes, así que conviene llamarlo después
    de cada carga de la ficha, no solo la primera vez.
    """
    cerrados = 0
    for _ in range(intentos):
        boton = page.locator(_CERRAR_POPUP).first
        try:
            boton.wait_for(state="visible", timeout=2000)
        except Exception:
            break  # no hay (más) popups: caso normal
        try:
            boton.click(timeout=2000)
            cerrados += 1
            page.wait_for_timeout(300)  # deja terminar la animación de cierre
        except Exception as e:
            logger.warning(f"BUK scraper: no se pudo cerrar el popup ({e})")
            break
    if cerrados:
        logger.info(f"BUK scraper: {cerrados} popup(s) cerrado(s)")
    return cerrados


def renovar_contrato(employee_id: int, response: str) -> dict:
    """
    Abre la ficha del empleado, dispara "Renovar contrato" y selecciona el tipo.
    response: 'indefinido' | 'plazo_fijo'. Devuelve {'job_id': ...}.
    Lanza BukScraperError si algo del flujo no aparece.
    """
    from playwright.sync_api import TimeoutError as PlaywrightTimeout

    tipo = TIPO_LABEL.get(response)
    if not tipo:
        raise BukScraperError(f"Tipo de renovación no soportado: {response}")

    if not _lock.acquire(timeout=180):
        raise BukScraperError("Otra renovación sigue en curso, reintenta en unos minutos")
    try:
        return _renovar(employee_id, tipo, PlaywrightTimeout)
    finally:
        _lock.release()


def _click(page, target, timeout: int = 10000) -> None:
    """Click que sobrevive al aviso de BUK.

    El aviso reaparece en cada carga de página y puede montarse tarde, justo
    encima del elemento: Playwright espera a que sea clickeable y expira. Ante un
    fallo se cierra el aviso y se reintenta una vez.

    Solo para clicks sobre la ficha. Dentro del formulario de renovación no se
    usa: ahí el único modal abierto es el propio formulario.
    """
    loc = page.locator(target) if isinstance(target, str) else target
    try:
        loc.click(timeout=timeout)
    except Exception:
        if not _cerrar_popups(page):
            raise
        loc.click(timeout=timeout)


def _evidencia(page, employee_id: int, motivo: str) -> str:
    """Guarda screenshot + HTML del momento del fallo. Devuelve el prefijo usado.

    Sin esto un fallo del scraper es irreproducible: la sesión se cierra y no
    queda nada que mirar.
    """
    import os
    from datetime import datetime

    carpeta = getattr(settings, "BUK_WEB_DEBUG_DIR", "") or "/tmp/buk_scraper"
    try:
        os.makedirs(carpeta, exist_ok=True)
        prefijo = os.path.join(
            carpeta, f"{employee_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{motivo}"
        )
        page.screenshot(path=f"{prefijo}.png", full_page=True)
        with open(f"{prefijo}.html", "w", encoding="utf-8") as f:
            f.write(page.content())
        logger.error(f"BUK scraper: evidencia guardada en {prefijo}.png / .html (url={page.url})")
        return prefijo
    except Exception as e:  # nunca tapar el error original por fallar al capturarlo
        logger.warning(f"BUK scraper: no se pudo guardar evidencia ({e})")
        return ""


def _renovar(employee_id: int, tipo: str, PlaywrightTimeout) -> dict:
    with _browser() as ctx:
        page = ctx.new_page()
        page.set_default_timeout(20000)
        try:
            return _flujo(page, employee_id, tipo, PlaywrightTimeout)
        except Exception as e:
            _evidencia(page, employee_id, type(e).__name__)
            raise


def _flujo(page, employee_id: int, tipo: str, PlaywrightTimeout) -> dict:
    _login(page)
    # El modal reaparece en cada carga, incluida la que sigue al login.
    _cerrar_popups(page)
    logger.info(f"BUK scraper: login OK, abriendo ficha employee={employee_id}")

    page.goto(f"{settings.BUK_WEB_BASE_URL}/employees/{employee_id}", wait_until="domcontentloaded")

    # Solo se avisa: el modal de facturación aparece en todas las cargas pero la
    # renovación sigue siendo posible (comprobado a mano). Cortar acá abortaría
    # renovaciones válidas.
    if _hay_bloqueo_facturacion(page):
        logger.warning(
            "BUK muestra el aviso de facturas vencidas (cobranza@buk.cl). "
            "Se continúa: el aviso no impide renovar, pero si BUK llega a "
            "restringir de verdad, el flujo fallará más adelante."
        )
    _cerrar_popups(page)

    boton = page.locator("a[href*='/renovar_contrato']").first
    try:
        boton.wait_for(state="visible", timeout=20000)
    except PlaywrightTimeout:
        raise BukScraperError(
            f"Empleado {employee_id}: no apareció el botón 'Renovar contrato' "
            f"(¿ya renovado, contrato no vencido, o sin permisos?). url={page.url}"
        )

    href = boton.get_attribute("href") or ""
    # href real: /jobs/<id>/renovar_contrato. Se extrae por posición relativa y no
    # por índice fijo, que se rompía si BUK devolvía una URL absoluta.
    partes = [p for p in href.split("?")[0].split("/") if p]
    try:
        job_id = partes[partes.index("jobs") + 1]
    except (ValueError, IndexError):
        raise BukScraperError(f"No se pudo extraer job_id del href {href!r}")
    logger.info(f"BUK scraper: job={job_id}, abriendo formulario de renovación")

    _click(page, boton)

    # De acá en adelante NO se cierran modales: el formulario de renovación es
    # él mismo un modal con su propio botón de cerrar, y el aviso de BUK no
    # aparece sobre él. Cerrar algo acá sería cerrar el formulario.
    # select2: el <select> nativo está oculto, hay que operar el widget.
    page.wait_for_selector("#select2-renovar_contrato_tipo_contrato-container", timeout=20000)
    page.click("#select2-renovar_contrato_tipo_contrato-container")
    page.click(f"li.select2-results__option:has-text('{tipo}')")

    seleccionado = page.inner_text("#select2-renovar_contrato_tipo_contrato-container").strip()
    if seleccionado.lower() != tipo.lower():
        raise BukScraperError(f"No se pudo seleccionar '{tipo}' (quedó '{seleccionado}')")

    logger.info(f"BUK scraper: tipo '{tipo}' seleccionado, enviando formulario")
    page.click("button[type=submit][data-disable-with='Renovando...']")
    page.wait_for_load_state("load")

    # ponytail: éxito = el botón de renovar ya no está disponible tras recargar
    # la ficha. Si BUK expone un flash de confirmación estable, cambiar por eso.
    # El selector usa *= igual que la búsqueda inicial: con href exacto no matcheaba
    # si BUK devolvía una URL absoluta o con query, y eso daba un falso éxito.
    selector_boton = f"a[href*='/jobs/{job_id}/renovar_contrato']"
    for intento in range(3):
        page.goto(f"{settings.BUK_WEB_BASE_URL}/employees/{employee_id}", wait_until="load")
        _cerrar_popups(page)
        if page.locator(selector_boton).count() == 0:
            logger.info(f"BUK scraper: renovado employee={employee_id} job={job_id} tipo={tipo}")
            return {"job_id": job_id, "contract_type": tipo}
        # BUK a veces tarda en reflejar el cambio en la ficha. Se reintenta antes
        # de declarar el fallo: si no, se reporta un error que no ocurrió.
        logger.warning(
            f"BUK scraper: el botón sigue presente para job {job_id} "
            f"(intento {intento + 1}/3), reintentando verificación"
        )
        page.wait_for_timeout(3000)

    raise BukScraperError(
        f"Renovación no confirmada: tras 3 verificaciones el botón sigue presente "
        f"para job {job_id}. Revisar en BUK si se aplicó antes de reintentar."
    )
