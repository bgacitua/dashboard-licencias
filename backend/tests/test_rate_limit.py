"""Checks del limitador de intentos y del hasheo del token de invitación."""
import time

from fastapi import HTTPException

from app.core.rate_limit import check_rate_limit, reset_rate_limit
from app.services.auth_service import AuthService


def test_bloquea_al_superar_el_limite():
    key = "test:bloqueo"
    reset_rate_limit(key)
    for _ in range(3):
        check_rate_limit(key, max_attempts=3, window_seconds=60)  # los 3 permitidos

    try:
        check_rate_limit(key, max_attempts=3, window_seconds=60)
        raise AssertionError("el 4º intento debió ser rechazado")
    except HTTPException as e:
        assert e.status_code == 429
        assert "Retry-After" in e.headers


def test_ventana_deslizante_libera():
    key = "test:ventana"
    reset_rate_limit(key)
    check_rate_limit(key, max_attempts=1, window_seconds=1)
    time.sleep(1.1)
    check_rate_limit(key, max_attempts=1, window_seconds=1)  # ventana vencida: pasa


def test_reset_limpia_el_contador():
    key = "test:reset"
    reset_rate_limit(key)
    check_rate_limit(key, max_attempts=1, window_seconds=60)
    reset_rate_limit(key)
    check_rate_limit(key, max_attempts=1, window_seconds=60)


def test_claves_independientes():
    reset_rate_limit("test:a")
    reset_rate_limit("test:b")
    check_rate_limit("test:a", max_attempts=1, window_seconds=60)
    check_rate_limit("test:b", max_attempts=1, window_seconds=60)  # b no hereda a


def test_hash_invite_token():
    h = AuthService._hash_invite_token
    assert h("abc") == h("abc")           # determinístico: permite buscar por igualdad
    assert h("abc") != h("abd")
    assert len(h("abc")) == 64            # cabe justo en VARCHAR(64)
    assert "abc" not in h("abc")


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"ok  {name}")
