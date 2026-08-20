"""
Check del diff de liquidaciones. Corre solo, sin BD ni BUK:
    python backend/tests/test_liquidaciones_diff.py
"""

import sys
import types
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# diff_liquidaciones es puro, pero su módulo importa settings al cargar y eso
# exige un .env válido. Se stubean las dos dependencias para que corra en seco.
for _nombre, _attr, _valor in (
    ("app.core.config", "settings", object()),
    ("app.core.logging_config", "logger", None),
):
    _mod = types.ModuleType(_nombre)
    setattr(_mod, _attr, _valor)
    sys.modules.setdefault(_nombre, _mod)

from app.services.liquidaciones_service import (  # noqa: E402
    _fecha_param,
    agrupar_por_rut,
    diff_liquidaciones,
)

D = Decimal


def _fila(rut, net, gross=None, afp=None, ips=None):
    return {
        "rut": rut,
        "income_net": D(net),
        "income_gross": D(gross if gross is not None else net),
        "income_afp": D(afp if afp is not None else net),
        "income_ips": D(ips if ips is not None else net),
    }


def test_fecha_param():
    # BUK espera DD-MM-YYYY con el día en 01, no YYYY-MM.
    assert _fecha_param("2026-08") == "01-08-2026"
    assert _fecha_param("2026-1") == "01-01-2026"


def test_cuadrado():
    t = {42: _fila("11.400.111-3", "999999.00")}
    assert diff_liquidaciones(t, {42: _fila("11.400.111-3", "999999.00")}) == []


def test_liquido_modificado():
    t = {42: _fila("11.400.111-3", "999999.00")}
    a = {42: _fila("11.400.111-3", "999999.00")}
    a[42]["income_net"] = D("1400000.00")
    difs = diff_liquidaciones(t, a)
    assert len(difs) == 1
    assert difs[0].campo == "income_net"
    assert difs[0].rut == "11.400.111-3"
    assert (difs[0].valor_target, difs[0].valor_actual) == (D("999999.00"), D("1400000.00"))


def test_bruto_se_mueve_con_liquido_igual():
    # El caso que justifica vigilar los cuatro campos y no solo el líquido.
    t = {42: _fila("11.400.111-3", "999999.00", gross="1111111.00")}
    a = {42: _fila("11.400.111-3", "999999.00", gross="1250000.00")}
    difs = diff_liquidaciones(t, a)
    assert [d.campo for d in difs] == ["income_gross"]


def test_bases_de_cotizacion():
    t = {42: _fila("11.400.111-3", "999999.00", afp="1114444.00", ips="1114444.00")}
    a = {42: _fila("11.400.111-3", "999999.00", afp="1200000.00", ips="1114444.00")}
    difs = diff_liquidaciones(t, a)
    assert [d.campo for d in difs] == ["income_afp"]


def test_varios_campos_de_un_mismo_trabajador():
    t = {42: _fila("11.400.111-3", "999999.00", gross="1111111.00")}
    a = {42: _fila("11.400.111-3", "888888.00", gross="1000000.00")}
    difs = diff_liquidaciones(t, a)
    assert {d.campo for d in difs} == {"income_net", "income_gross", "income_afp", "income_ips"}


def test_baja_post_cierre_conserva_el_rut_del_snapshot():
    # El trabajador ya no viene en la lectura: el rut solo existe en el target.
    t = {42: _fila("11.400.111-3", "999999.00")}
    difs = diff_liquidaciones(t, {})
    assert len(difs) == 1
    assert difs[0].campo == "baja_post_cierre"
    assert difs[0].rut == "11.400.111-3"
    assert difs[0].valor_actual is None


def test_alta_post_cierre():
    difs = diff_liquidaciones({}, {77: _fila("22.333.444-5", "700000.00")})
    assert len(difs) == 1
    assert difs[0].campo == "alta_post_cierre"
    assert difs[0].valor_target is None
    assert difs[0].rut == "22.333.444-5"


def test_diferencia_de_centavos():
    # Sin umbral: el delta esperado es 0 exacto.
    t = {42: _fila("11.400.111-3", "850000.00")}
    a = {42: _fila("11.400.111-3", "850000.00")}
    a[42]["income_net"] = D("850000.01")
    assert [d.campo for d in diff_liquidaciones(t, a)] == ["income_net"]


def test_agrupar_por_rut():
    # Dos campos movidos de un mismo trabajador = una sola entrada en la alerta.
    filas = [
        {"employee_id": 42, "rut": "11.400.111-3", "campo": "income_net",
         "valor_target": "999999.00", "valor_actual": "888888.00"},
        {"employee_id": 42, "rut": "11.400.111-3", "campo": "income_gross",
         "valor_target": "1111111.00", "valor_actual": "1000000.00"},
        {"employee_id": 77, "rut": "22.333.444-5", "campo": "income_afp",
         "valor_target": "500000.00", "valor_actual": "510000.00"},
    ]
    grupos = agrupar_por_rut(filas)
    assert len(grupos) == 2
    g42 = next(g for g in grupos if g["employee_id"] == 42)
    assert g42["rut"] == "11.400.111-3"
    assert len(g42["campos"]) == 2
    assert [c["etiqueta"] for c in g42["campos"]] == ["Líquido", "Bruto"]


if __name__ == "__main__":
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_"):
            fn()
            print(f"ok  {nombre}")
    print("\nTodo cuadra.")
