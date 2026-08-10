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


def _renovar(employee_id: int, tipo: str, PlaywrightTimeout) -> dict:
    with _browser() as ctx:
        page = ctx.new_page()
        page.set_default_timeout(20000)
        _login(page)

        page.goto(f"{settings.BUK_WEB_BASE_URL}/employees/{employee_id}", wait_until="domcontentloaded")

        # Si BUK bloqueó la cuenta por deuda, se corta acá: seguir solo produciría
        # un "no apareció el botón Renovar contrato" que oculta la causa real.
        if _hay_bloqueo_facturacion(page):
            raise BukScraperError(
                "BUK restringió el acceso por facturas vencidas sin pagar. "
                "La renovación no se puede aplicar hasta regularizar la deuda "
                "(contacto: cobranza@buk.cl)."
            )
        _cerrar_popups(page)

        boton = page.locator("a[href*='/renovar_contrato']").first
        try:
            boton.wait_for(state="visible", timeout=20000)
        except PlaywrightTimeout:
            raise BukScraperError(
                f"Empleado {employee_id}: no apareció el botón 'Renovar contrato' "
                "(¿ya renovado, contrato no vencido, o sin permisos?)"
            )
        job_id = boton.get_attribute("href").split("/")[2]
        try:
            boton.click(timeout=10000)
        except PlaywrightTimeout:
            # El popup puede aparecer tarde y quedar tapando el botón: Playwright
            # espera a que sea clickeable y expira. Se cierra y se reintenta una vez.
            if not _cerrar_popups(page):
                raise
            boton.click(timeout=10000)

        # select2: el <select> nativo está oculto, hay que operar el widget.
        page.wait_for_selector("#select2-renovar_contrato_tipo_contrato-container", timeout=20000)
        page.click("#select2-renovar_contrato_tipo_contrato-container")
        page.click(f"li.select2-results__option:has-text('{tipo}')")

        seleccionado = page.inner_text("#select2-renovar_contrato_tipo_contrato-container").strip()
        if seleccionado.lower() != tipo.lower():
            raise BukScraperError(f"No se pudo seleccionar '{tipo}' (quedó '{seleccionado}')")

        page.click("button[type=submit][data-disable-with='Renovando...']")
        page.wait_for_load_state("load")

        # ponytail: éxito = el botón de renovar ya no está disponible tras recargar
        # la ficha. Si BUK expone un flash de confirmación estable, cambiar por eso.
        page.goto(f"{settings.BUK_WEB_BASE_URL}/employees/{employee_id}", wait_until="load")
        _cerrar_popups(page)
        if page.locator(f"a[href='/jobs/{job_id}/renovar_contrato']").count() > 0:
            raise BukScraperError(
                f"Renovación no aplicada: el botón sigue presente para job {job_id}"
            )

        logger.info(f"BUK scraper: renovado employee={employee_id} job={job_id} tipo={tipo}")
        return {"job_id": job_id, "contract_type": tipo}
