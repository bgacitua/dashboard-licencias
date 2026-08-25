"""Check de la property Usuario.invite_pending (sin DB: instancia en memoria)."""
from datetime import datetime, timedelta

from app.models.auth import Usuario


def _user(token, expires):
    u = Usuario()
    u.invite_token = token
    u.invite_token_expires_at = expires
    return u


def test_invite_pending():
    ahora = datetime.utcnow()
    assert _user("tok", ahora + timedelta(hours=1)).invite_pending is True
    assert _user("tok", ahora - timedelta(hours=1)).invite_pending is False  # expirada
    assert _user(None, ahora + timedelta(hours=1)).invite_pending is False   # ya canjeada
    assert _user("tok", None).invite_pending is False                        # sin expiración
    assert _user(None, None).invite_pending is False


if __name__ == "__main__":
    test_invite_pending()
    print("ok")
