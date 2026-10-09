"""Check de la normalización de RUT de `get_datos_aviso_paralelo`.

`rh.employees.rut` viene de BUK como xx.xxx.xxx-x, pero el RUT que llega al
endpoint `/finiquitos/{rut}/correo-salida` sale del listado de finiquitos sin
puntos. Mientras la consulta comparó los dos en crudo nunca hubo match: el
aviso paralelo se saltaba en silencio (el correo principal igual salía).

Acá se reimplementa la expresión SQL y se comprueba que los formatos que
circulan colapsen a la misma clave.

Corre con: python backend/tests/test_aviso_paralelo_rut.py
"""
import re
from pathlib import Path

CONSULTA = (
    Path(__file__).parents[1] / "app" / "repositories" / "desvinculacion_repository.py"
).read_text(encoding="utf-8")


# lower(regexp_replace(rut, '[^0-9kK]', '', 'g')) en Postgres.
def sql_rut(valor: str) -> str:
    return re.sub(r"[^0-9kK]", "", valor).lower()


if __name__ == "__main__":
    # Los dos formatos que se cruzan en el endpoint.
    assert sql_rut("12.345.678-9") == sql_rut("12345678-9") == "123456789"
    # DV con K, en cualquier caja.
    assert sql_rut("6.543.210-K") == sql_rut("6543210-k") == "6543210k"
    # RUTs distintos siguen siendo distintos.
    assert sql_rut("12.345.678-9") != sql_rut("12.345.679-7")

    # La consulta debe normalizar los dos lados: con uno solo vuelve el bug.
    assert "regexp_replace(e.rut" in CONSULTA
    assert "regexp_replace(:rut" in CONSULTA
    # DISTINCT ON exige que el ORDER BY abra con la misma expresión.
    assert "ORDER BY lower(regexp_replace(e.rut" in CONSULTA

    print("ok")
