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
                 url: str = "http://hhee-scrapping:8000", timeout: float = 180.0,
                 timeout_reporte: float = 600.0) -> None:
        self.hhee_api_url = url
        self.hhee_api_key = _Secreto(propia)
        self.external_api_key = _Secreto(externa)
        self.hhee_timeout = timeout
        self.hhee_reporte_timeout = timeout_reporte


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


# --- Endpoints ---------------------------------------------------------------
# Se llaman directo, sin TestClient: son funciones normales y así el test no
# monta la app ni pelea con la autorización del módulo. Ojo que los defaults de
# los parámetros son objetos Query(), no None, así que hay que pasarlos todos.


class _Resultado:
    def __init__(self, filas):
        self._filas = filas

    def mappings(self):
        return list(self._filas)


class _FakeDb:
    """Session mínima: guarda los parámetros que le llegan al SQL."""

    def __init__(self, filas=()):
        self.filas = filas
        self.params = None

    def execute(self, sql, params=None):
        self.params = params
        return _Resultado(self.filas)


_DEFAULTS = dict(recinto=None, tipo=None, rut=None, anio_iso=None,
                 semana_iso=None, desde=None, hasta=None, limite=2000)


def _alertas(db, **kw):
    from app.modules.asistencia.router import hhee_alertas
    return hhee_alertas(db=db, **{**_DEFAULTS, **kw})


def test_endpoint_aplica_la_semana_anterior_por_defecto():
    """Sin filtros de fecha, la consulta tiene que salir acotada a una semana.

    Es la garantía de que la pantalla no abre pidiendo la tabla entera.
    """
    db = _FakeDb()
    resp = _alertas(db)
    assert db.params["anio_iso"] is not None and db.params["semana_iso"] is not None
    assert (db.params["anio_iso"], db.params["semana_iso"]) == sv.semana_iso_por_defecto()
    # y sin rango sobre clave_periodo, que es el filtro que no discrimina
    assert db.params["desde"] is None and db.params["hasta"] is None
    assert resp.total == 0 and resp.columns  # DataResponse armado igual sin filas


def test_endpoint_respeta_la_semana_pedida():
    db = _FakeDb()
    _alertas(db, anio_iso=2026, semana_iso=35)
    assert (db.params["anio_iso"], db.params["semana_iso"]) == (2026, 35)


def test_endpoint_rechaza_rango_sin_tipo():
    """desde/hasta sobre clave_periodo solo son interpretables dentro de un tipo.

    Sin `tipo`, el rango mezclaría los dos formatos y devolvería de más: mejor
    422 que un resultado silenciosamente incorrecto.
    """
    from fastapi import HTTPException

    try:
        _alertas(_FakeDb(), desde="2026-09-01")
    except HTTPException as exc:
        assert exc.status_code == 422 and "tipo" in exc.detail
    else:
        raise AssertionError("un rango sin tipo debería cortar con 422")

    # con tipo, el mismo rango pasa y llega al SQL
    db = _FakeDb()
    _alertas(db, desde="2026-09-01", hasta="2026-09-06", tipo="diario")
    assert db.params["desde"] == "2026-09-01" and db.params["tipo"] == "diario"
    # y ya no se le impone la semana por defecto
    assert db.params["anio_iso"] is None


def test_endpoint_rechaza_tipo_invalido():
    from fastapi import HTTPException

    try:
        _alertas(_FakeDb(), tipo="mensual")
    except HTTPException as exc:
        assert exc.status_code == 422
    else:
        raise AssertionError("un tipo inválido debería cortar con 422")


def test_endpoint_devuelve_las_filas_como_dataresponse():
    fila = {"recinto": "36787", "rut": "1-9", "tipo": "semanal",
            "clave_periodo": "2026-W36", "horas": 15.23, "tope": 12.0}
    resp = _alertas(_FakeDb([fila]))
    assert resp.total == 1 and resp.rows[0]["clave_periodo"] == "2026-W36"


# --- Refresco ----------------------------------------------------------------


def test_refrescar_traduce_los_fallos_a_mensajes_utiles():
    """Un fallo del scraper no puede salir como stacktrace ni como su cuerpo crudo.

    El 401 es el caso interesante: el único error posible ahí es que las dos
    keys no coincidan, y el mensaje tiene que decirlo.
    """
    import httpx

    cfg = _Cfg(propia="k")
    original = sv.httpx.request
    casos = [
        (httpx.TimeoutException("timeout"), "no respondio a tiempo"),
        (httpx.HTTPStatusError("401", request=httpx.Request("POST", "http://x"),
                               response=httpx.Response(401)), "HHEE_API_KEY"),
        (httpx.ConnectError("sin ruta"), "No se pudo contactar"),
    ]
    try:
        for excepcion, esperado in casos:
            def explota(*a, **kw):
                raise excepcion
            sv.httpx.request = explota
            try:
                sv.refrescar(cfg)
            except RuntimeError as exc:
                assert esperado in str(exc), (excepcion, str(exc))
            else:
                raise AssertionError(f"{type(excepcion).__name__} debería dar RuntimeError")
    finally:
        sv.httpx.request = original


def test_refrescar_manda_la_key_y_los_filtros():
    """La API key viaja en el header desde el backend, nunca por el navegador."""
    capturado = {}

    class _Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"ok": 1, "fallidos": 0}

    def fake_request(metodo, url, params=None, timeout=None, headers=None):
        capturado.update(metodo=metodo, url=url, params=params, timeout=timeout,
                         headers=headers)
        return _Resp()

    original = sv.httpx.request
    sv.httpx.request = fake_request
    try:
        sv.refrescar(_Cfg(propia="secreta"), recintos="36787,42123")
    finally:
        sv.httpx.request = original

    assert capturado["metodo"] == "POST"
    assert capturado["url"] == "http://hhee-scrapping:8000/hhee/sync"
    assert capturado["headers"] == {"X-API-Key": "secreta"}
    assert capturado["params"] == {"recintos": "36787,42123"}   # sin desde/hasta vacios


def test_historial_arma_el_get_con_periodo_y_filtros():
    """El reporte de aprobadas es un GET al scraper, con la key puesta acá.

    Los filtros vacios no viajan: el scraper trata "" como "sin filtro", pero
    mandarlos igual hace que dos consultas equivalentes se vean distintas.
    """
    capturado = {}

    class _Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"rows": [{"rut": "1-9"}], "columns": ["rut"]}

    def fake_request(metodo, url, params=None, timeout=None, headers=None):
        capturado.update(metodo=metodo, url=url, params=params, timeout=timeout,
                         headers=headers)
        return _Resp()

    original = sv.httpx.request
    sv.httpx.request = fake_request
    try:
        r = sv.historial(_Cfg(propia="secreta"), desde="2026-06-15",
                         hasta="2026-07-14", recinto="42123")
    finally:
        sv.httpx.request = original

    assert capturado["metodo"] == "GET"
    assert capturado["url"] == "http://hhee-scrapping:8000/hhee/historial"
    assert capturado["headers"] == {"X-API-Key": "secreta"}
    assert capturado["params"] == {"desde": "2026-06-15", "hasta": "2026-07-14",
                                   "recinto": "42123"}          # sin `rut` vacio
    # El reporte usa su propio timeout, no el (mucho mas corto) del refresco.
    assert capturado["timeout"] == 600.0
    assert r["rows"] == [{"rut": "1-9"}]


if __name__ == "__main__":
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_"):
            fn()
            print("ok", nombre)
