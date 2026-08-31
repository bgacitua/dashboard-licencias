"""Chequeos estáticos del backend. Ejecutar: python test_auth_endpoints.py

  1. Ninguna ruta queda sin autenticación por olvido (fuera de PUBLICAS).
  2. El `state` del OAuth de Microsoft rechaza lo que no firmamos, y no se reusa.
  3. Ninguna función es `async def` sin usar `await`.

Nada toca la BD ni la red: se inspecciona el grafo de dependencias de FastAPI y
el AST del paquete.
"""
import ast
import os
import pathlib

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
    consume_oauth_state_token, create_access_token, create_oauth_state_token,
    decode_oauth_state_token, get_current_user, get_current_active_user,
)

# Rutas que un externo debe poder abrir sin cuenta en la plataforma. Cada una
# se protege con su propio token firmado o es parte del login.
# Agregar algo aquí es una decisión de seguridad: justificarla en el commit.
PUBLICAS = {
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/set-password"),
    ("POST", "/api/v1/auth/duo/callback"),
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


def check_oauth_state() -> None:
    """El `state` del OAuth de Microsoft solo vale si lo firmó /auth/login.

    Es lo unico que impide que un tercero complete el consentimiento con su
    cuenta y quede como remitente de los correos automaticos.
    """
    valido = create_oauth_state_token("benja")
    assert decode_oauth_state_token(valido)["sub"] == "benja"

    # Un JWT de sesion normal no sirve como state: distinto token_type.
    assert decode_oauth_state_token(create_access_token({"sub": "benja"})) is None

    # Firma alterada: cambiar un caracter del payload invalida el token.
    cabecera, cuerpo, firma = valido.split(".")
    alterado = f"{cabecera}.{cuerpo[:-2]}XY.{firma}"
    assert decode_oauth_state_token(alterado) is None

    # Basura y vacio no pasan.
    assert decode_oauth_state_token("no-es-un-jwt") is None
    assert decode_oauth_state_token("") is None

    # Un solo uso: el segundo canje con el mismo state no vale, aunque la firma
    # siga siendo buena y el token no haya expirado.
    quemable = create_oauth_state_token("benja")
    assert consume_oauth_state_token(quemable)["sub"] == "benja"
    assert consume_oauth_state_token(quemable) is None

    # Quemar uno no invalida los demas.
    otro = create_oauth_state_token("otra-persona")
    assert consume_oauth_state_token(otro)["sub"] == "otra-persona"

    print("OK: el state del OAuth rechaza tokens ajenos, alterados, vacios y reusados.")


# `async def` que sí deben seguir siendo corrutinas, cada una por su motivo.
ASYNC_JUSTIFICADAS = {
    ("app/main.py", "lifespan"),                              # @asynccontextmanager
    ("app/core/exceptions.py", "generic_exception_handler"),  # handler de Starlette
    ("app/modules/asistencia/service.py", "get_paged"),       # doble de un método awaited
}


def check_sin_async_de_mas() -> None:
    """Una `async def` sin `await` bloquea el event loop en cada llamada.

    FastAPI manda las funciones `def` a un threadpool y corre las `async def` en
    el loop. Una consulta a la BD, que es síncrona, dentro de una `async def`
    congela el proceso entero mientras dura: nadie más avanza. Quitar la palabra
    `async` es todo el arreglo.
    """
    sobrantes = []
    for archivo in sorted(pathlib.Path("app").rglob("*.py")):
        try:
            arbol = ast.parse(archivo.read_text(encoding="utf-8"))
        except SyntaxError as e:
            # No se puede revisar lo que no parsea. Se avisa en vez de callarlo:
            # un archivo roto escondería cualquier async de mas que tenga dentro.
            print(f"AVISO: {archivo.as_posix()} no es Python valido, sin revisar ({e.msg})")
            continue
        for nodo in ast.walk(arbol):
            if not isinstance(nodo, ast.AsyncFunctionDef):
                continue
            clave = (archivo.as_posix(), nodo.name)
            if clave in ASYNC_JUSTIFICADAS:
                continue
            usa_async = any(
                isinstance(h, (ast.Await, ast.AsyncWith, ast.AsyncFor))
                for h in ast.walk(nodo)
                if h is not nodo
            )
            if not usa_async:
                sobrantes.append(f"{archivo.as_posix()}:{nodo.lineno} {nodo.name}")

    assert not sobrantes, (
        "async def sin await (bloquean el event loop); quitarles la palabra async "
        "o justificarlas en ASYNC_JUSTIFICADAS:" + chr(10) + "  " + (chr(10)+"  ").join(sobrantes)
    )
    print("OK: ninguna funcion es async def sin usar await.")


def main() -> int:
    check_oauth_state()
    check_sin_async_de_mas()

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
