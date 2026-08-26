"""Check de la normalización de RUT que cruza asistencia con rh.employees.

La regla vive en SQL (jefaturas_por_rut) y en JS (limpiarRut). Si las dos no
dan el mismo cuerpo, la consulta devuelve {} y todo cae al correo manual sin
que nada falle a la vista. Acá se reimplementan ambas y se comparan.

Corre con: python backend/tests/test_jefaturas_rut.py
"""
import re

# ltrim(left(regexp_replace(rut, '[^0-9kK]', '', 'g'), -1), '0') en Postgres.
def sql_rut(valor: str) -> str:
    return re.sub(r"[^0-9kK]", "", valor)[:-1].lstrip("0")


# limpiarRut() de frontend/src/features/asistencia/marcas.js.
def js_rut(valor: str) -> str:
    v = str(valor or "").strip().replace(".", "")
    cuerpo = v.split("-")[0] if "-" in v else (v[:-1] if len(v) > 1 else v)
    return cuerpo.lstrip("0")


CASOS = ["12.345.678-9", "9.876.543-2", "6.543.210-K", "012.345.678-9"]

if __name__ == "__main__":
    for rut in CASOS:
        assert sql_rut(rut) == js_rut(rut), f"{rut}: SQL={sql_rut(rut)} JS={js_rut(rut)}"
    # El DNI que manda Buk viene con puntos y guion; el front ya lo limpia.
    assert js_rut("12.345.678-9") == "12345678"
    assert sql_rut("6.543.210-K") == "6543210"
    print("ok")
