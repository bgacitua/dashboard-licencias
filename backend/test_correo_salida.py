"""Verifica el cuerpo del aviso de salida de personal sin enviar nada.

Ejecutar desde backend/:
    python test_correo_salida.py
"""
import os
from datetime import date
from unittest.mock import patch

# Settings exige credenciales de BD al importar; el correo no las usa.
# ponytail: valores dummy en vez de levantar el .env real.
for _k in (
    "DB_USER", "DB_PASSWORD", "MARCAS_DB_SERVER", "MARCAS_DB_USER",
    "MARCAS_DB_PASSWORD", "MARCAS_DB_NAME", "BUK_API_BASE_URL", "BUK_API_KEY",
):
    os.environ.setdefault(_k, "dummy")

from app.schemas.desvinculacion import CorreoSalidaRequest
from app.services.desvinculacion_service import enviar_correo_salida

RUT = "12.345.678-9"


def _enviar(motivo, cargo="Analista de Operaciones"):
    """Intercepta el envío y devuelve los kwargs con que se habría llamado a Graph."""
    data = CorreoSalidaRequest(
        nombre_trabajador="Juan Muñoz Soto",
        cargo=cargo,
        fecha_salida=date(2026, 5, 20),
        motivo=motivo,
    )
    with patch("app.services.desvinculacion_service.send_email_graph", return_value=True) as mock, \
         patch("app.services.desvinculacion_service.settings") as fake_settings:
        fake_settings.SALIDA_PERSONAL_TO = "rrhh@cramer.cl"
        fake_settings.SALIDA_PERSONAL_CC = "jefatura@cramer.cl"
        fake_settings.SALIDA_PERSONAL_FROM = ""
        enviar_correo_salida(RUT, data)
        return mock.call_args.kwargs


renuncia = _enviar("renuncia")
assert "con fecha de 20-05-2026" in renuncia["html_body"]
assert "ha renunciado Juan Muñoz Soto" in renuncia["html_body"]
assert f"Rut: {RUT} (Analista de Operaciones)" in renuncia["html_body"]
assert renuncia["to"] == "rrhh@cramer.cl"
assert renuncia["cc"] == "jefatura@cramer.cl"
assert renuncia["sender"] == ""  # vacío = envía desde la cuenta autenticada

desvinculacion = _enviar("desvinculacion")
assert "se ha desvinculado a Juan Muñoz Soto" in desvinculacion["html_body"]

sin_cargo = _enviar("renuncia", cargo=None)
assert f"Rut: {RUT}." in sin_cargo["html_body"]

print(renuncia["subject"])
print(renuncia["html_body"])
print("OK")
