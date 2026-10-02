"""Verifica el cuerpo del aviso paralelo de salida sin enviar nada ni tocar la BD.

Ejecutar desde backend/:
    python -m tests.test_correo_salida_paralelo
"""
import os
from datetime import date
from unittest.mock import patch

# Settings exige credenciales de BD al importar; el correo no las usa.
# ponytail: valores dummy en vez de levantar la configuración real.
for _k in (
    "DB_USER", "DB_PASSWORD", "MARCAS_DB_SERVER", "MARCAS_DB_USER",
    "MARCAS_DB_PASSWORD", "MARCAS_DB_NAME", "BUK_API_BASE_URL", "BUK_API_KEY",
):
    os.environ.setdefault(_k, "dummy")

from app.services.correo_salida_paralelo import enviar_correo_salida_paralelo

RUT = "12.345.678-9"

FILA_BD = {
    "nombre_trabajador": "Juan Muñoz Soto",
    "rut_trabajador": RUT,
    "empresa": "Cramer S.A.",
    "contract_type": "Indefinido",
}


def _enviar(fila=FILA_BD, paralelo_to="seguros@cramer.cl"):
    """Intercepta el envío y la consulta a la BD; devuelve (resultado, mock de Graph)."""
    with patch("app.services.correo_salida_paralelo.send_email_graph", return_value=True) as mock, \
         patch("app.services.correo_salida_paralelo.DesvinculacionRepository") as repo, \
         patch("app.services.correo_salida_paralelo.settings") as fake_settings:
        fake_settings.SALIDA_PERSONAL_PARALELO_TO = paralelo_to
        fake_settings.SALIDA_PERSONAL_FROM = ""
        repo.return_value.get_datos_aviso_paralelo.return_value = fila
        enviado = enviar_correo_salida_paralelo(None, RUT, date(2026, 5, 20))
        return enviado, mock


indefinido_ok, indefinido = _enviar()
assert indefinido_ok
kw = indefinido.call_args.kwargs
assert kw["to"] == "seguros@cramer.cl"
assert kw["subject"] == "Movimiento de personal - Cramer S.A."
assert "excluir con fecha de 20-05-2026" in kw["html_body"]
assert "seguro complementario de salud o vida" in kw["html_body"]
assert "Juan Muñoz Soto" in kw["html_body"]
assert RUT in kw["html_body"]
assert "Cramer S.A." in kw["html_body"]
assert "Contrato indefinido" in kw["html_body"]

_, fijo = _enviar({**FILA_BD, "contract_type": "Fijo"})
assert "Contrato fijo" in fijo.call_args.kwargs["html_body"]

_, sin_tipo = _enviar({**FILA_BD, "contract_type": None})
assert "Contrato sin especificar" in sin_tipo.call_args.kwargs["html_body"]

# Sin fila en rh.employees no se envía nada.
sin_datos_ok, sin_datos = _enviar(fila=None)
assert sin_datos_ok is False
assert sin_datos.call_count == 0

# Sin casilla configurada tampoco.
sin_config_ok, sin_config = _enviar(paralelo_to="")
assert sin_config_ok is False
assert sin_config.call_count == 0

print(indefinido.call_args.kwargs["subject"])
print(indefinido.call_args.kwargs["html_body"])
print("OK")
