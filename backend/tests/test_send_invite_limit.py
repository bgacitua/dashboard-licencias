"""El reenvío de invitación aplica límite por destinatario y por admin."""
import pytest

from app.api.v1.endpoints import admin


def test_send_invite_aplica_las_dos_llaves(monkeypatch):
    llamadas = []
    monkeypatch.setattr(
        admin, "check_rate_limit",
        lambda key, max_attempts, window_seconds: llamadas.append((key, max_attempts, window_seconds)),
    )
    monkeypatch.setattr(admin, "AuthService", lambda db: type("S", (), {"resend_invite": lambda self, uid: True})())

    admin.send_user_invite(user_id=7, current_user=type("U", (), {"id": 1})(), db=None)

    assert llamadas == [
        ("send-invite:user:7", 3, 3600),
        ("send-invite:admin:1", 20, 3600),
    ]


def test_el_limite_corre_antes_de_enviar(monkeypatch):
    """Un 429 no debe consumir el envío ni regenerar el token."""
    def bloquea(key, max_attempts, window_seconds):
        raise RuntimeError("bloqueado")

    monkeypatch.setattr(admin, "check_rate_limit", bloquea)
    monkeypatch.setattr(admin, "AuthService", lambda db: pytest.fail("no debió construir el servicio"))

    with pytest.raises(RuntimeError):
        admin.send_user_invite(user_id=7, current_user=type("U", (), {"id": 1})(), db=None)
