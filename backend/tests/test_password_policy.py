"""Política de contraseñas: el validador y los tres schemas que lo usan."""
import pytest
from pydantic import ValidationError

from app.schemas.auth import (
    SetPasswordRequest,
    UsuarioCreate,
    UsuarioUpdate,
    validate_password_strength,
)

VALIDA = "Contrasena2026"


def test_acepta_contrasena_fuerte():
    assert validate_password_strength(VALIDA) == VALIDA


@pytest.mark.parametrize("password", [
    "Corta2026",        # menos de 12
    "contrasena2026",   # sin mayúscula
    "CONTRASENA2026",   # sin minúscula
    "ContrasenaLarga",  # sin número
])
def test_rechaza_contrasena_debil(password):
    with pytest.raises(ValueError):
        validate_password_strength(password)


def test_none_pasa_sin_validar():
    """None = "no se cambia la contraseña" en UsuarioUpdate / invitación por email."""
    assert validate_password_strength(None) is None


def test_set_password_request_valida():
    assert SetPasswordRequest(token="t", password=VALIDA).password == VALIDA
    with pytest.raises(ValidationError):
        SetPasswordRequest(token="t", password="corta")


def test_admin_no_puede_setear_contrasena_debil():
    base = dict(username="jperez", email="jperez@cramer.cl", rol_id=1)
    assert UsuarioCreate(**base, password=VALIDA).password == VALIDA
    with pytest.raises(ValidationError):
        UsuarioCreate(**base, password="123456")
    with pytest.raises(ValidationError):
        UsuarioUpdate(password="123456")
