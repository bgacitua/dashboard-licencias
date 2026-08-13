"""Verifica que _cerrar_popups cierra el modal de BUK y libera el botón tapado.

Corre contra HTML local, sin tocar BUK. Requiere playwright + chromium, así que
va dentro del contenedor:

    docker compose exec backend python -m tests.test_buk_popup
"""
from app.services.buk_scraper import _cerrar_popups, _hay_bloqueo_facturacion


def _pagina(titulo: str, cuerpo: str) -> str:
    """Ficha con el modal de BUK encima. Markup calcado del real."""
    return f"""
<html><body>
  <a href="/jobs/12345/renovar_contrato" id="renovar"
     style="position:absolute;top:200px;left:100px">Renovar contrato</a>
  <div id="overlay" class="modal"
       style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10">
    <div class="modal-content" style="background:#fff;padding:20px;margin:60px auto;width:420px">
      <div class="modal-header">
        <h2 class="modal-title">{titulo}</h2>
        <button class="close" data-dismiss="modal" aria-label="Cerrar"
                onclick="document.getElementById('overlay').remove()">
          <span aria-hidden="true">
            <span class="buk-icon material-symbols-rounded" data-name-icon="close"
                  aria-hidden="true" translate="no">close</span>
          </span>
        </button>
      </div>
      <div class="modal-body">
        <h4>{cuerpo}</h4>
        <!-- Otros iconos de la ficha que NO cierran nada -->
        <button type="button"><span data-name-icon="content_copy">content_copy</span></button>
        <span data-name-icon="keyboard_arrow_left">keyboard_arrow_left</span>
      </div>
    </div>
  </div>
</body></html>
"""


PAGINA = _pagina("Novedades", "Conoce las nuevas funcionalidades.")

BLOQUEO = _pagina(
    "Aviso de Facturación",
    "Se restringió tu acceso a la plataforma, debido a que tienes facturas "
    "vencidas sin pagar. En cuanto regularices la deuda, se reestablecerán "
    "los accesos.",
)

SIN_POPUP = """
<html><body>
  <a href="/jobs/12345/renovar_contrato" id="renovar">Renovar contrato</a>
</body></html>
"""


def main():
    from playwright.sync_api import sync_playwright
    from playwright.sync_api import TimeoutError as PlaywrightTimeout

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # 1. Con el popup abierto, el botón está tapado: el click expira.
        page.set_content(PAGINA)
        try:
            page.locator("#renovar").click(timeout=1500)
            raise AssertionError("el overlay deberia interceptar el click")
        except PlaywrightTimeout:
            pass

        # 2. Tras cerrarlo, el mismo click funciona. Cierra 1 solo: los otros
        #    data-name-icon de la ficha no son botones de cerrar.
        assert _cerrar_popups(page) == 1, "deberia cerrar exactamente 1 popup"
        page.locator("#renovar").click(timeout=2000)

        # 3. Sin popup no hace nada ni falla (caso normal).
        page.set_content(SIN_POPUP)
        assert _cerrar_popups(page) == 0, "no deberia cerrar nada"
        page.locator("#renovar").click(timeout=2000)

        # 4. El modal de deuda se distingue de uno inocuo.
        page.set_content(BLOQUEO)
        assert _hay_bloqueo_facturacion(page), "no detecto el bloqueo por facturacion"
        page.set_content(PAGINA)
        assert not _hay_bloqueo_facturacion(page), "falso positivo en modal normal"
        page.set_content(SIN_POPUP)
        assert not _hay_bloqueo_facturacion(page), "falso positivo sin modal"

        browser.close()
    print("OK: popup cerrado, boton clickeable, sin popup no falla, "
          "y bloqueo por facturacion detectado")


if __name__ == "__main__":
    main()
