"""El correo de invitación: plantilla compartida y traducción de fallas."""
import pytest

from app.services import auth_service as auth_module
from app.services.auth_service import AuthService, INVITE_TTL_HORAS
from app.services.email_templates import FOOTER_APP, check_outlook_safe
from app.services.email_token_service import AuthRequiredError


def _servicio() -> AuthService:
    """AuthService sin DB: _send_invite_email no la toca."""
    return AuthService.__new__(AuthService)


def _capturar(monkeypatch, resultado=True) -> dict:
    enviados = {}

    def falso_envio(to, cc, subject, html_body, **kwargs):
        enviados.update(to=to, subject=subject, html=html_body)
        if isinstance(resultado, Exception):
            raise resultado
        return resultado

    monkeypatch.setattr("app.services.email_service.send_email_graph", falso_envio)
    return enviados


def test_usa_la_plantilla_compartida(monkeypatch):
    enviados = _capturar(monkeypatch)
    monkeypatch.setattr(auth_module.settings, "PUBLIC_URL", "https://personas.cramer.cl")

    _servicio()._send_invite_email("jperez@cramer.cl", "Juan Pérez", "tok123")

    html = enviados["html"]
    assert "HR Portal" not in html and "Portal RRHH" not in html
    assert FOOTER_APP in html
    assert "https://personas.cramer.cl/set-password?token=tok123" in html
    assert f"{INVITE_TTL_HORAS} horas" in html  # el texto y el TTL del token coinciden
    check_outlook_safe(html)  # el correo anterior no pasaba esto


def test_sin_sesion_de_microsoft_es_runtime_error(monkeypatch):
    """create_user y resend_invite dependen de RuntimeError para marcar la falla."""
    _capturar(monkeypatch, resultado=AuthRequiredError("sin sesión"))

    with pytest.raises(RuntimeError, match="no está configurado"):
        _servicio()._send_invite_email("jperez@cramer.cl", "Juan Pérez", "tok123")


def test_envio_rechazado_es_runtime_error(monkeypatch):
    _capturar(monkeypatch, resultado=False)

    with pytest.raises(RuntimeError, match="Error al enviar"):
        _servicio()._send_invite_email("jperez@cramer.cl", "Juan Pérez", "tok123")
