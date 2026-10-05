"""Corre todos los self-checks del backend: `python -m tests.run_all`.

El repo no usa pytest; cada `tests/test_*.py` prueba funciones puras (sin DB) y
se ejecuta como módulo. Esto los junta en un comando para que no haya que
recordar cuáles son ni ir uno por uno.
"""
from __future__ import annotations

import runpy
import sys
import traceback
from pathlib import Path

AQUI = Path(__file__).parent


def main() -> int:
    modulos = sorted(p.stem for p in AQUI.glob("test_*.py"))
    fallados = []
    for nombre in modulos:
        try:
            runpy.run_module(f"tests.{nombre}", run_name="__main__")
        except SystemExit as e:
            # Varios tests terminan con sys.exit(); solo un código distinto de 0 es falla.
            if e.code not in (0, None):
                fallados.append(nombre)
                print(f"FALLA {nombre} (exit {e.code})", file=sys.stderr)
                continue
        except BaseException:  # noqa: BLE001 - cualquier excepción deja el test en rojo
            fallados.append(nombre)
            print(f"FALLA {nombre}", file=sys.stderr)
            traceback.print_exc()
            continue
        print(f"ok    {nombre}")

    print(f"\n{len(modulos) - len(fallados)}/{len(modulos)} self-checks ok")
    # Sin módulos es falla: significa que el glob se rompió, no que todo pase.
    return 1 if fallados or not modulos else 0


if __name__ == "__main__":
    raise SystemExit(main())
