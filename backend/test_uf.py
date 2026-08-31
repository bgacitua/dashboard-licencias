"""Chequeo del parseo de la UF del Banco Central. Ejecutar: python test_uf.py

No sale a la red: se le pasan respuestas ya conocidas a la funcion de parseo.
"""
import os
from datetime import date
from unittest.mock import patch

os.environ.setdefault("SKIP_CREATE_ALL", "1")
for var in ("DB_USER", "DB_PASSWORD", "MARCAS_DB_SERVER", "MARCAS_DB_USER",
            "MARCAS_DB_PASSWORD", "MARCAS_DB_NAME", "BUK_API_BASE_URL", "BUK_API_KEY"):
    os.environ.setdefault(var, "test")

from app.api.v1.endpoints.finiquitos import _pedir_uf, _ultimo_dia_del_mes  # noqa: E402


class _Resp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


# Respuesta real del Banco Central para F073.UFF.PRE.Z.D.
OK_REAL = {
    "Codigo": 0,
    "Descripcion": "Success",
    "Series": {
        "descripEsp": "Unidad de fomento (UF)",
        "seriesId": "F073.UFF.PRE.Z.D",
        "Obs": [{"indexDateString": "31-08-2026", "value": "40873.77", "statusCode": "OK"}],
    },
    "SeriesInfos": [],
}


def main() -> int:
    # El ultimo dia del mes, incluido febrero bisiesto y los meses de 30.
    assert _ultimo_dia_del_mes(date(2026, 8, 5)) == date(2026, 8, 31)
    assert _ultimo_dia_del_mes(date(2026, 2, 1)) == date(2026, 2, 28)
    assert _ultimo_dia_del_mes(date(2028, 2, 1)) == date(2028, 2, 29)
    assert _ultimo_dia_del_mes(date(2026, 4, 30)) == date(2026, 4, 30)

    with patch("app.api.v1.endpoints.finiquitos.httpx.get", return_value=_Resp(OK_REAL)):
        assert _pedir_uf(date(2026, 8, 31)) == 40873.77

    # Fecha aun no publicada: el Banco Central devuelve la serie sin observaciones.
    # Tiene que ser None, no un error: arriba se cae al valor de hoy.
    sin_obs = {"Codigo": 0, "Descripcion": "Success", "Series": {"Obs": []}}
    with patch("app.api.v1.endpoints.finiquitos.httpx.get", return_value=_Resp(sin_obs)):
        assert _pedir_uf(date(2026, 12, 31)) is None

    # Observacion presente pero marcada como no valida.
    mala = {"Codigo": 0, "Series": {"Obs": [{"value": "", "statusCode": "ND"}]}}
    with patch("app.api.v1.endpoints.finiquitos.httpx.get", return_value=_Resp(mala)):
        assert _pedir_uf(date(2026, 8, 31)) is None

    # Token invalido: el Banco Central contesta 200 con Codigo != 0. Eso es un
    # error y tiene que reventar, no devolver None en silencio.
    error = {"Codigo": -1, "Descripcion": "Autenticacion fallida"}
    with patch("app.api.v1.endpoints.finiquitos.httpx.get", return_value=_Resp(error)):
        try:
            _pedir_uf(date(2026, 8, 31))
            raise AssertionError("un Codigo != 0 tiene que lanzar excepcion")
        except RuntimeError as e:
            assert "Autenticacion fallida" in str(e)

    print("OK: la UF del Banco Central se parsea, y el no-publicado se distingue del error.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
