"""
Verifica el `state` que viaja a Duo: es un JWT firmado, cabe en el límite que
acepta el SDK y no se puede falsificar. Es lo único del flujo Duo que corre de
nuestro lado; el resto lo valida el propio SDK contra el servicio.

Ejecutar: python -m tests.test_duo_state   (desde backend/)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from duo_universal.client import MINIMUM_STATE_LENGTH, MAXIMUM_STATE_LENGTH

from app.core.security import create_pre_auth_token, decode_pre_auth_token, create_access_token


def main():
    email = "usuario.de.nombre.bastante.largo@cramer.cl"
    state = create_pre_auth_token(42, "usuario.largo", email)

    # El SDK de Duo rechaza states fuera de este rango.
    assert MINIMUM_STATE_LENGTH <= len(state) <= MAXIMUM_STATE_LENGTH, len(state)

    payload = decode_pre_auth_token(state)
    assert payload is not None
    assert payload["user_id"] == 42
    assert payload["duo_username"] == email

    # Un state manipulado no debe validar (firma rota).
    assert decode_pre_auth_token(state[:-3] + "aaa") is None

    # Un token de sesión normal no sirve como state, ni al revés.
    assert decode_pre_auth_token(create_access_token({"sub": "usuario.largo"})) is None

    print(f"OK — state de {len(state)} caracteres, dentro del rango de Duo")


if __name__ == "__main__":
    main()
