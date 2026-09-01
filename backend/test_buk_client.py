"""Chequeo del cliente HTTP compartido hacia BUK.

No importa la app (arrastra SQLAlchemy y el resto): lee el fuente, extrae
buk_client y lo ejecuta contra un httpx de mentira. Sin red.
"""
import asyncio
import ast
import pathlib
from contextlib import nullcontext
from typing import Optional

FUENTE = pathlib.Path(__file__).parent / "app" / "services" / "finiquitos_service.py"


class _ClienteFalso:
    is_closed = False


def _cargar_buk_client():
    arbol = ast.parse(FUENTE.read_text(encoding="utf-8"))
    fn = next(n for n in arbol.body
              if isinstance(n, ast.FunctionDef) and n.name == "buk_client")
    ns = {
        "httpx": type("httpx", (), {"AsyncClient": lambda **kw: _ClienteFalso()}),
        "nullcontext": nullcontext,
        "Optional": Optional,
        "_cliente_buk": None,
    }
    exec(compile(ast.Module([fn], []), "<buk_client>", "exec"), ns)
    return ns["buk_client"]


async def _dos_llamadas(buk_client):
    async with buk_client() as a:
        pass
    async with buk_client() as b:
        pass
    return a is b


def test_cliente_se_reusa():
    assert asyncio.run(_dos_llamadas(_cargar_buk_client())), \
        "cada llamada abrio un cliente nuevo"


def test_no_hay_clientes_sueltos():
    texto = FUENTE.read_text(encoding="utf-8")
    # El unico AsyncClient permitido es el que construye buk_client().
    sueltos = texto.count("async with httpx.AsyncClient(")
    assert sueltos == 0, f"{sueltos} call sites siguen abriendo su propio cliente"


if __name__ == "__main__":
    test_cliente_se_reusa()
    test_no_hay_clientes_sueltos()
    print("ok")
