"""Checks del submódulo de horas extras (asistencia/hhee).

Lo único no trivial acá es el filtro por semana: la tabla `app.hhee_alertas`
guarda dos formatos de `clave_periodo` en la misma columna de texto
('2026-09-02' para las diarias, '2026-W36' para las semanales), así que un
rango lexicográfico entre ambos NO acota nada. El filtro va por
`anio_iso`/`semana_iso`, y estos tests fijan esa decisión.

Ejecutable como script suelto desde backend/: `python tests/test_hhee_alertas.py`
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.modules.asistencia.hhee import service as sv  # noqa: E402
from app.modules.asistencia.hhee.repository import _SQL  # noqa: E402


def test_semana_anterior():
    # lunes 2026-09-07 -> la semana pasada es la que acaba de cerrar
    assert sv.semana_anterior(date(2026, 9, 7)) == (date(2026, 8, 31), date(2026, 9, 6))
    # miércoles, mismo resultado
    assert sv.semana_anterior(date(2026, 9, 9)) == (date(2026, 8, 31), date(2026, 9, 6))
    # domingo cierra SU semana ISO, no abre la siguiente
    assert sv.semana_anterior(date(2026, 9, 6)) == (date(2026, 8, 24), date(2026, 8, 30))
    # siempre lunes a domingo, 7 días
    for d in (date(2026, 1, 1), date(2026, 3, 2), date(2026, 12, 31)):
        lunes, domingo = sv.semana_anterior(d)
        assert lunes.isoweekday() == 1 and domingo.isoweekday() == 7
        assert (domingo - lunes).days == 6


def test_semana_iso_por_defecto():
    assert sv.semana_iso_por_defecto(date(2026, 9, 7)) == (2026, 36)
    # borde de año: el 2026-01-05 es lunes de la semana 2, así que la anterior
    # es la 1 del mismo año ISO
    assert sv.semana_iso_por_defecto(date(2026, 1, 5)) == (2026, 1)


def test_clave_semana():
    assert sv.clave_semana(date(2026, 8, 31)) == "2026-W36"
    assert sv.clave_semana(date(2026, 1, 5)) == "2026-W02"   # dos dígitos, con cero


def test_por_que_no_se_filtra_por_rango_de_clave_periodo():
    """El rango lexicográfico entre los dos formatos no acota nada.

    Este test documenta el bug que motivó filtrar por anio_iso/semana_iso: 'W'
    (0x57) ordena después de cualquier dígito, así que un rango
    ['2026-08-31', '2026-W36'] se come todas las claves del año, de los dos
    tipos. Si alguien vuelve a proponer el rango, esto lo frena.
    """
    desde, hasta = "2026-08-31", "2026-W36"
    # claves de otras semanas que el rango deja pasar igual
    for k in ("2026-09-30", "2026-12-25", "2026-W01", "2026-W35"):
        assert desde <= k <= hasta, k
    # y encima recorta las que si debería incluir: la semanal de una semana
    # posterior queda fuera solo por como ordena el numero, no por la fecha
    assert not ("2026-W37" <= hasta)


def test_sql_castea_los_filtros_opcionales():
    """Sin CAST, un parámetro que solo aparece contra NULL no tiene tipo
    inferible y Postgres rechaza la consulta con AmbiguousParameter en drivers
    de binding server-side. Verificado contra la base real."""
    import re
    # el SQL alinea los filtros en columnas: se normalizan los espacios
    sql = re.sub(r"\s+", " ", str(_SQL))
    for p in ("recinto", "tipo", "rut", "desde", "hasta"):
        assert f"CAST(:{p} AS text)" in sql, p
    for p in ("anio_iso", "semana_iso", "limite"):
        assert f"CAST(:{p} AS int)" in sql, p
    # la tabla se califica con su esquema, no se confía en el search_path
    assert "app.hhee_alertas" in sql


class _Secreto:
    def __init__(self, valor: str) -> None:
        self._valor = valor

    def get_secret_value(self) -> str:
        return self._valor


class _Cfg:
    """Settings mínimo para los checks de credencial del refresco."""

    def __init__(self, propia: str = "", externa: str = "",
                 url: str = "http://hhee-scrapping:8000") -> None:
        self.hhee_api_url = url
        self.hhee_api_key = _Secreto(propia)
        self.external_api_key = _Secreto(externa)


def test_no_cae_a_external_api_key():
    """A diferencia de marcas_api_key, la key del scraper no tiene fallback.

    external_api_key es el token de Buk Ctrl; esta es la X-API-Key de un
    servicio propio. Reusarla mandaría la credencial de Buk a otro servicio y
    ataría el refresco a su rotación, así que tener solo la de Buk debe cortar
    con 503 en vez de intentar con ella.
    """
    from fastapi import HTTPException

    try:
        sv.exigir_configurado(_Cfg(externa="token-de-buk"))
    except HTTPException as exc:
        assert exc.status_code == 503
    else:
        raise AssertionError("solo con external_api_key debería cortar con 503")


def test_refrescar_exige_configuracion():
    """Sin key propia, 503 y no un stacktrace: la lectura de la tabla no
    depende de esto y tiene que seguir funcionando."""
    from fastapi import HTTPException

    sv.exigir_configurado(_Cfg(propia="x"))   # con la key propia, no corta

    for cfg, motivo in ((_Cfg(), "sin API key"), (_Cfg(propia="x", url=""), "sin URL")):
        try:
            sv.exigir_configurado(cfg)
        except HTTPException as exc:
            assert exc.status_code == 503
        else:
            raise AssertionError(f"{motivo} debería cortar con 503")


if __name__ == "__main__":
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_"):
            fn()
            print("ok", nombre)
