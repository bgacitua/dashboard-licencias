"""Aviso al encargado cuando se crea una cuenta, y su respaldo por n8n."""
from app.services import auth_service as auth_module
from app.services.auth_service import AuthService
from app.services.email_templates import check_outlook_safe
from app.services.email_token_service import AuthRequiredError


class _Rol:
    nombre = "rrhh"


class _Usuario:
    username = "jperez"
    email = "jperez@cramer.cl"
    nombre_completo = "Juan Pérez"
    rol = _Rol()


def _preparar(monkeypatch, envio=True):
    """Devuelve (correos, avisos_n8n). `envio`: True, False o una excepción."""
    correos, avisos = [], []

    def falso_envio(to, cc, subject, html_body, **kwargs):
        if isinstance(envio, Exception):
            raise envio
        correos.append({"to": to, "subject": subject, "html": html_body})
        return envio

    monkeypatch.setattr("app.services.email_service.send_email_graph", falso_envio)
    monkeypatch.setattr("app.services.scheduler_service._notify_n8n",
                        lambda payload, url=None: avisos.append(payload))
    monkeypatch.setattr(auth_module.settings, "USER_NOTIFY_EMAIL", "bgacitua@cramer.cl")
    return correos, avisos


def _notificar(invite_ok):
    AuthService.__new__(AuthService)._notify_user_created(_Usuario(), invite_ok)


def test_invitacion_enviada(monkeypatch):
    correos, avisos = _preparar(monkeypatch)

    _notificar(invite_ok=True)

    assert len(correos) == 1 and avisos == []
    assert correos[0]["to"] == "bgacitua@cramer.cl"
    assert "jperez" in correos[0]["subject"]
    assert "Invitación enviada" in correos[0]["html"]
    check_outlook_safe(correos[0]["html"])


def test_invitacion_fallida_lo_dice(monkeypatch):
    correos, avisos = _preparar(monkeypatch)

    _notificar(invite_ok=False)

    assert "no salió" in correos[0]["html"]
    assert avisos == []  # el correo del aviso sí salió: no hace falta el respaldo


def test_contrasena_fijada_por_admin(monkeypatch):
    correos, _ = _preparar(monkeypatch)

    _notificar(invite_ok=None)

    assert "no se envió invitación" in correos[0]["html"]


def test_sin_graph_cae_a_n8n(monkeypatch):
    """El aviso de que el correo falló no puede viajar por el correo que falló."""
    correos, avisos = _preparar(monkeypatch, envio=AuthRequiredError("sin sesión"))

    _notificar(invite_ok=False)

    assert correos == []
    assert len(avisos) == 1
    assert avisos[0]["tipo"] == "error_auth"
    assert "jperez" in avisos[0]["mensaje"]
    assert "invitación tampoco salió" in avisos[0]["mensaje"]


def test_n8n_no_miente_si_la_invitacion_si_salio(monkeypatch):
    _, avisos = _preparar(monkeypatch, envio=False)

    _notificar(invite_ok=True)

    assert "tampoco salió" not in avisos[0]["mensaje"]


def test_sin_destinatario_no_avisa(monkeypatch):
    correos, avisos = _preparar(monkeypatch)
    monkeypatch.setattr(auth_module.settings, "USER_NOTIFY_EMAIL", "")

    _notificar(invite_ok=True)

    assert correos == [] and avisos == []


def test_el_aviso_roto_no_deshace_la_creacion(monkeypatch):
    """create_user devuelve el usuario aunque el aviso reviente: la cuenta ya
    está commiteada y perderla por un correo sería el peor desenlace."""
    creado = _Usuario()
    creado.invite_email_failed = False

    servicio = AuthService.__new__(AuthService)
    servicio.repository = type("R", (), {
        "create_user": lambda self, **kw: creado,
        "set_user_modules": lambda self, u, ids: None,
    })()
    monkeypatch.setattr(AuthService, "_notify_user_created",
                        lambda self, u, ok: (_ for _ in ()).throw(ValueError("boom")))

    devuelto = servicio.create_user(username="jperez", password="Contrasena2026", rol_id=1)

    assert devuelto is creado
