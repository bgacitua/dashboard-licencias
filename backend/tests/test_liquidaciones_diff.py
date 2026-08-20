"""
Check del diff de líquidos. Corre solo, sin BD ni BUK:
    python backend/tests/test_liquidaciones_diff.py
"""

import sys
import types
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# diff_liquidos es puro, pero su módulo importa settings al cargar y eso exige un
# .env válido. Se stubean las dos dependencias para que el check corra en seco.
for _nombre, _attr, _valor in (
    ("app.core.config", "settings", object()),
    ("app.core.logging_config", "logger", None),
):
    _mod = types.ModuleType(_nombre)
    setattr(_mod, _attr, _valor)
    sys.modules.setdefault(_nombre, _mod)

from app.services.liquidaciones_service import diff_liquidos  # noqa: E402

D = Decimal


def test_cuadrado():
    target = {1: D("850000.00"), 2: D("1200000.00")}
    assert diff_liquidos(target, dict(target)) == []


def test_monto_modificado():
    target = {1: D("850000.00"), 2: D("1200000.00")}
    actual = {1: D("850000.00"), 2: D("1400000.00")}
    assert diff_liquidos(target, actual) == [(2, D("1200000.00"), D("1400000.00"))]


def test_baja_post_cierre():
    # Empleado que estaba en el cierre y desapareció: descuadre, no "sin cambios".
    assert diff_liquidos({1: D("850000.00")}, {}) == [(1, D("850000.00"), None)]


def test_alta_post_cierre():
    # Empleado nuevo aparecido después del cierre.
    assert diff_liquidos({}, {9: D("700000.00")}) == [(9, None, D("700000.00"))]


def test_diferencia_de_centavos():
    # 850000 != 850000.01 — no hay umbral, el delta esperado es 0 exacto.
    difs = diff_liquidos({1: D("850000.00")}, {1: D("850000.01")})
    assert difs == [(1, D("850000.00"), D("850000.01"))]


if __name__ == "__main__":
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_"):
            fn()
            print(f"ok  {nombre}")
    print("\nTodo cuadra.")
