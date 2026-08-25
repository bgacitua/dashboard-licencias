"""Valores que el módulo hereda de la plataforma en vez de duplicarlos.

La plataforma ya habla con la API core de Buk (`BUK_API_BASE_URL` +
`BUK_API_KEY`, header auth_token) para alertas de contrato y créditos. Pedir
esas mismas credenciales otra vez con nombres propios solo abre la puerta a que
una copia quede vieja: el token se rota en un lado y el módulo sigue con el
anterior, fallando en silencio hasta que alguien mire los logs.

Las variables ASISTENCIA_BUK_* quedan como override, para apuntar a otra
empresa o a otro token sin tocar el resto de la plataforma.
"""
from app.core.config import settings as _plataforma

from .config import AsistenciaSettings

# La plataforma guarda la base (.../api/v1/chile); el módulo necesita el listado
# de vigentes, que es un path fijo sobre esa base.
_PATH_EMPLEADOS = "/employees/active"


def buk_core_url(settings: AsistenciaSettings) -> str:
    """URL del listado de empleados vigentes. Vacía = el filtro cae al fallback."""
    if settings.buk_api_url:
        return settings.buk_api_url
    base = (_plataforma.BUK_API_BASE_URL or "").rstrip("/")
    return f"{base}{_PATH_EMPLEADOS}" if base else ""


def buk_core_key(settings: AsistenciaSettings) -> str:
    propia = settings.buk_api_key.get_secret_value()
    return propia or (_plataforma.BUK_API_KEY or "")


def _demo() -> None:
    """python -m app.modules.asistencia.plataforma"""
    from pydantic import SecretStr

    vacio = AsistenciaSettings(_env_file=None)
    esperada = f"{_plataforma.BUK_API_BASE_URL.rstrip('/')}{_PATH_EMPLEADOS}"
    assert buk_core_url(vacio) == esperada, buk_core_url(vacio)
    assert buk_core_key(vacio) == _plataforma.BUK_API_KEY

    propio = AsistenciaSettings(
        _env_file=None,
        buk_api_url="https://otra.buk.cl/api/v1/chile/employees/active",
        buk_api_key=SecretStr("otro-token"),
    )
    assert buk_core_url(propio) == "https://otra.buk.cl/api/v1/chile/employees/active"
    assert buk_core_key(propio) == "otro-token"
    print("ok")


if __name__ == "__main__":
    _demo()
