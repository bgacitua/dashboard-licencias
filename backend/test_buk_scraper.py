"""
Prueba manual del scraper de renovación BUK.

    python test_buk_scraper.py <employee_id> <indefinido|plazo_fijo>

Requiere BUK_WEB_USER / BUK_WEB_PASSWORD en .env.
Usar BUK_WEB_HEADLESS=false para ver el navegador.

OJO: ejecuta la renovación real en BUK. Probar con un empleado desechable.
"""
import sys

from app.services.buk_scraper import TIPO_LABEL, renovar_contrato

if __name__ == "__main__":
    assert TIPO_LABEL["plazo_fijo"] == "Plazo Fijo"
    assert TIPO_LABEL["indefinido"] == "Indefinido"

    if len(sys.argv) != 3 or sys.argv[2] not in TIPO_LABEL:
        print(__doc__)
        sys.exit(1)

    print(renovar_contrato(int(sys.argv[1]), sys.argv[2]))
