"""Verifica el cuerpo del aviso paralelo de salida sin enviar nada.

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

from app.schemas.desvinculacion import CorreoSalidaRequest
from app.services.correo_salida_paralelo import enviar_correo_salida_paralelo

RUT = "12.345.678-9"


def _enviar(tipo_contrato, paralelo_to="legal@cramer.cl"):
    """Intercepta el envío y devuelve (resultado, mock de Graph)."""
    data = CorreoSalidaRequest(
        nombre_trabajador="Juan Muñoz Soto",
        cargo="Analista de Operaciones",
        fecha_salida=date(2026, 5, 20),
        motivo="desvinculacion",
        tipo_contrato=tipo_contrato,
    )
    with patch("app.services.correo_salida_paralelo.send_email_graph", return_value=True) as mock, \
         patch("app.services.correo_salida_paralelo.settings") as fake_settings:
        fake_settings.SALIDA_PERSONAL_PARALELO_TO = paralelo_to
        fake_settings.SALIDA_PERSONAL_FROM = ""
        enviado = enviar_correo_salida_paralelo(RUT, data)
        return enviado, mock


indefinido_ok, indefinido = _enviar("indefinido")
assert indefinido_ok
kw = indefinido.call_args.kwargs
assert kw["to"] == "legal@cramer.cl"
assert "con fecha de 20-05-2026" in kw["html_body"]
assert f"Rut: {RUT} (Analista de Operaciones)" in kw["html_body"]
assert "contrato indefinido" in kw["html_body"]
assert "indemnización por años de servicio" in kw["html_body"]

_, fijo = _enviar("fijo")
assert "plazo fijo" in fijo.call_args.kwargs["html_body"]
assert "no corresponde indemnización" in fijo.call_args.kwargs["html_body"]

# Sin casilla configurada no se envía nada.
sin_config_ok, sin_config = _enviar("indefinido", paralelo_to="")
assert sin_config_ok is False
assert sin_config.call_count == 0

print(indefinido.call_args.kwargs["subject"])
print(indefinido.call_args.kwargs["html_body"])
print("OK")
