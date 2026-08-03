"""
Renovación de contratos en BUK vía navegador (Playwright).

Se usa en lugar del PATCH a la API: la UI de BUK aplica las reglas de negocio
del flujo de renovación, por lo que es la vía segura mientras el PATCH está
deshabilitado.
"""
import logging
from contextlib import contextmanager

from app.core.config import settings

logger = logging.getLogger(__name__)

LOGIN_URL = "/users/sign_in"
TIPO_LABEL = {"indefinido": "Indefinido", "plazo_fijo": "Plazo Fijo"}


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

    with _browser() as ctx:
        page = ctx.new_page()
        page.set_default_timeout(20000)
        _login(page)

        page.goto(f"{settings.BUK_WEB_BASE_URL}/employees/{employee_id}", wait_until="domcontentloaded")

        boton = page.locator("a[href*='/renovar_contrato']").first
        try:
            boton.wait_for(state="visible", timeout=20000)
        except PlaywrightTimeout:
            raise BukScraperError(
                f"Empleado {employee_id}: no apareció el botón 'Renovar contrato' "
                "(¿ya renovado, contrato no vencido, o sin permisos?)"
            )
        job_id = boton.get_attribute("href").split("/")[2]
        boton.click()

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
        if page.locator(f"a[href='/jobs/{job_id}/renovar_contrato']").count() > 0:
            raise BukScraperError(
                f"Renovación no aplicada: el botón sigue presente para job {job_id}"
            )

        logger.info(f"BUK scraper: renovado employee={employee_id} job={job_id} tipo={tipo}")
        return {"job_id": job_id, "contract_type": tipo}
