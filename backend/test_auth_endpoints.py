"""Chequeo: ningún endpoint de la API queda sin autenticación por olvido.

Ejecutar:  python test_auth_endpoints.py
Falla si aparece una ruta nueva sin dependencia de auth que no esté en PUBLICAS.
No toca la BD ni la red: solo inspecciona el grafo de dependencias de FastAPI.
"""
import os

# Valores de relleno: Settings exige estas variables, pero el chequeo nunca
# abre una conexión. Así corre sin las credenciales reales delante.
os.environ.setdefault("SKIP_CREATE_ALL", "1")
for var in (
    "DB_USER", "DB_PASSWORD", "MARCAS_DB_SERVER", "MARCAS_DB_USER",
    "MARCAS_DB_PASSWORD", "MARCAS_DB_NAME", "BUK_API_BASE_URL", "BUK_API_KEY",
):
    os.environ.setdefault(var, "test")

from app.main import app  # noqa: E402
from app.core.security import (  # noqa: E402
    get_current_user, get_current_active_user,
)

# Rutas que un externo debe poder abrir sin cuenta en la plataforma. Cada una
# se protege con su propio token firmado o es parte del login.
# Agregar algo aquí es una decisión de seguridad: justificarla en el commit.
PUBLICAS = {
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/set-password"),
    ("POST", "/api/v1/auth/duo/callback"),
    ("GET",  "/api/v1/contract-alerts/auth/login"),
    ("GET",  "/api/v1/contract-alerts/auth/callback"),
    ("GET",  "/api/v1/contract-alerts/respond"),
    ("POST", "/api/v1/contract-alerts/respond/confirm"),
    ("GET",  "/api/v1/overtime/respond"),
    ("POST", "/api/v1/overtime/respond"),
    ("POST", "/api/v1/overtime/respond/confirm"),
    # Formulario que responde la jefatura desde el correo: no tiene cuenta.
    ("GET",  "/api/v1/asistencia/notificacion/{token}"),
    ("POST", "/api/v1/asistencia/notificacion/{token}"),
    # No toca estado en el servidor: el cliente borra su token. Exigir un token
    # valido solo impediria cerrar sesion con uno ya expirado.
    ("POST", "/api/v1/auth/logout"),
    ("GET",  "/"),
}

# Nombres de las dependencias que establecen identidad. require_role y
# require_module devuelven closures, por eso se buscan por nombre.
AUTORIZADORAS = {
    get_current_user.__name__, get_current_active_user.__name__,
    "role_checker", "module_checker",
}


def _protegida(route) -> bool:
    """True si algún nodo del árbol de dependencias de la ruta autentica."""
    pendientes = list(route.dependant.dependencies)
    while pendientes:
        dep = pendientes.pop()
        if dep.call is not None and getattr(dep.call, "__name__", "") in AUTORIZADORAS:
            return True
        pendientes.extend(dep.dependencies)
    return False


def main() -> int:
    huecos = []
    for route in app.routes:
        if not hasattr(route, "dependant") or not getattr(route, "methods", None):
            continue
        for metodo in route.methods - {"HEAD", "OPTIONS"}:
            if (metodo, route.path) in PUBLICAS:
                continue
            if not _protegida(route):
                huecos.append(f"{metodo} {route.path}")

    if huecos:
        print("Endpoints sin autenticacion y fuera de la lista PUBLICAS:")
        for h in sorted(huecos):
            print("  -", h)
        print("\nProteger la ruta, o justificar por que es publica y agregarla a PUBLICAS.")
        return 1

    print(f"OK: {sum(1 for r in app.routes if hasattr(r, 'dependant'))} rutas revisadas, ningun hueco.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
