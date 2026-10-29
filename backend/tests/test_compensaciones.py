"""Self-check del módulo Compensaciones. No toca la BD ni OpenAI: usa una sesión
falsa que captura el SQL y `ia` parchado.

Ejecutar:
    python -m tests.test_compensaciones
"""
from types import SimpleNamespace

from fastapi import HTTPException

from app.modules.compensaciones import ia, router, service
from app.modules.compensaciones import repository as repo
from app.modules.compensaciones.config import settings

ESTUDIO = {"id": 1, "vista": "2025 CL TRS", "pais": "CL", "anio": 2025, "moneda": "CLP", "factor_mensual": 12}


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None

    def scalar(self):
        return 7


class FakeSession:
    """Responde por fragmento de SQL y guarda (sql, params) de cada consulta."""

    def __init__(self, respuestas):
        self.respuestas = respuestas  # {fragmento: filas}
        self.llamadas: list[tuple[str, dict]] = []

    def execute(self, sql, params=None):
        sql = str(sql)
        self.llamadas.append((sql, params or {}))
        for fragmento, filas in self.respuestas.items():
            if fragmento in sql:
                return _Result(filas)
        return _Result([])

    def commit(self):
        pass

    @property
    def sql(self) -> str:
        return "\n".join(s for s, _ in self.llamadas)


def _cand(n, similitud):
    return {"cargo_codigo": f"SCN.03.{n:03d}", "titulo": f"Cargo {n}", "familia": "F", "subfamilia": "S",
            "titulo_tipico": None, "descripcion": None, "similitud": similitud}


def _db_match(candidatos, estudio=ESTUDIO):
    return FakeSession({
        "FROM compensaciones.estudio WHERE": [estudio] if estudio else [],
        "DISTINCT ON": candidatos,
    })


def _con_ia(puntuar):
    ia.embedding = lambda texto: [0.1, 0.2]
    ia.puntuar = puntuar


def test_sin_gpt_usa_coseno():
    _con_ia(lambda *a: None)
    db = _db_match([_cand(1, 0.8), _cand(2, 0.6)])
    out = service.match(db, 1, "Comprador", None)
    assert out["fuente"] == "coseno"
    assert [c["score"] for c in out["candidatos"]] == [80.0, 60.0]
    assert "INSERT" not in db.sql


def test_ordena_por_score_y_corta():
    cands = [_cand(i, 0.9 - i / 100) for i in range(1, 8)]
    # GPT puntúa al revés del orden de entrada: el último candidato es el mejor.
    _con_ia(lambda *a: [{"candidato_numero": i, "score": i * 10, "justificacion": "ok"} for i in range(1, 8)])
    out = service.match(_db_match(cands), 1, "Comprador", "Compra insumos")
    assert out["fuente"] == "gpt"
    assert len(out["candidatos"]) == settings.mostrar
    assert [c["score"] for c in out["candidatos"]] == [70, 60, 50, 40, 30]
    assert out["candidatos"][0]["cargo_codigo"] == "SCN.03.007"


def test_hibrido_solo_con_mas_de_un_cargo():
    fila = {"tipo": "cargo", "cargo_codigo": "SCN.03.017", "titulo": "A", "medida_codigo": "COMP1",
            "n_companias": 8, "n_observaciones": 9, "p25": None, "mediana": 1, "promedio": 2, "p75": None}
    hib = {"medida_codigo": "COMP1", "p25": None, "mediana": 1, "promedio": 2, "p75": None}
    for cargos, esperado in ((["SCN.03.017"], 0), (["SCN.03.017", "SCN.03.001"], 1)):
        db = FakeSession({
            "GROUP BY n.codigo": [{"codigo": "M20", "nombre": "x"}],
            "FROM compensaciones.estudio WHERE": [ESTUDIO],
            "GROUP BY m.medida_codigo": [hib],
            "CASE WHEN m.es_core": [fila],
        })
        out = service.resultado(db, 1, cargos, "M20")
        assert sum(f["tipo"] == "hibrido" for f in out["filas"]) == esperado
        assert out["moneda"] == "CLP"


def test_promedio_de_subfamilias_solo_con_mas_de_una():
    def sub(cod, v):
        return {"tipo": "subfamilia", "cargo_codigo": cod, "titulo": cod, "medida_codigo": "COMP1",
                "n_companias": 5, "n_observaciones": 5, "p25": v, "mediana": v, "promedio": v, "p75": None}

    for subs, esperado in (([sub("SCN.03.000", 10)], 0), ([sub("SCN.03.000", 10), sub("HRM.02.000", 30)], 1)):
        db = FakeSession({
            "GROUP BY n.codigo": [{"codigo": "M20", "nombre": "x"}],
            "FROM compensaciones.estudio WHERE": [ESTUDIO],
            "CASE WHEN m.es_core": subs,
        })
        out = service.resultado(db, 1, ["SCN.03.017"], "M20")
        prom = [f for f in out["filas"] if f["tipo"] == "promedio_subfamilias" and f["medida_codigo"] == "COMP1"]
        assert len(prom) == esperado
        if esperado:
            assert prom[0]["mediana"] == 20 and prom[0]["p75"] is None  # p75 s/d en una -> s/d


def test_inexistentes_404_y_nivel_400():
    _con_ia(lambda *a: None)
    for llamar in (
        lambda: service.match(_db_match([], estudio=None), 99, "X", None),
        lambda: service.resultado(FakeSession({}), 99, ["SCN.03.017"], "M20"),
    ):
        try:
            llamar()
        except HTTPException as e:
            assert e.status_code == 404
        else:
            raise AssertionError("debió responder 404")

    db = FakeSession({"FROM compensaciones.estudio WHERE": [ESTUDIO], "GROUP BY n.codigo": [{"codigo": "M10", "nombre": "x"}]})
    try:
        service.resultado(db, 1, ["SCN.03.017"], "M20")
    except HTTPException as e:
        assert e.status_code == 400
    else:
        raise AssertionError("debió responder 400")
    assert "INSERT" not in db.sql


def test_valores_del_usuario_viajan_como_parametros():
    _con_ia(lambda *a: None)
    nombre = "Comprador'; DROP TABLE x; --"
    db = FakeSession({})
    a = {"estudio_id": 1, "cargo_nombre": nombre, "descriptor": None, "candidatos": "[]",
         "cargos": ["SCN.03.017"], "nivel": "M20", "cargo_empresa_id": None}
    repo.guardar_analisis(db, a, "gabriel")
    repo.historial(db, 1, "gabriel")
    repo.borrar_analisis(db, 7, "gabriel")
    assert nombre not in db.sql and "gabriel" not in db.sql
    assert db.llamadas[0][1]["cargo_nombre"] == nombre and db.llamadas[0][1]["usuario"] == "gabriel"
    assert db.llamadas[1][1]["usuario"] == "gabriel"
    assert "DELETE" in db.llamadas[2][0] and db.llamadas[2][1] == {"id": 7, "usuario": "gabriel"}


def test_cargos_empresa_por_estudio_y_404():
    fila = {"id": 5, "name": "Operario"}
    db = FakeSession({"FROM compensaciones.estudio WHERE": [ESTUDIO], "JOIN compensaciones.cargo_empresa ce": [fila]})
    assert service.cargos_empresa(db, 1) == [fila]
    assert db.llamadas[-1][1] == {"estudio_id": 1}
    assert "LATERAL" in db.sql
    try:
        service.cargos_empresa(FakeSession({}), 99)
    except HTTPException as e:
        assert e.status_code == 404
    else:
        raise AssertionError("debió responder 404")


ADMIN = router.Acceso("gabriel", True, None)
ANALISTA = router.Acceso("gabriel", False, ["CL"])


def _guardar(acc, cargo_ok, cargo_empresa_id=5):
    db = FakeSession({"FROM compensaciones.estudio WHERE": [ESTUDIO],
                      "FROM compensaciones.cargo_empresa ce": [{"x": 1}] if cargo_ok else []})
    body = router.AnalisisIn(estudio_id=1, cargo_nombre="Operario", cargos=["SCN.03.017"], nivel="M20",
                             candidatos=[], cargo_empresa_id=cargo_empresa_id)
    return db, lambda: router.guardar(body, db, acc)


def _status(llamar):
    try:
        llamar()
    except HTTPException as e:
        return e.status_code


def test_homologar_exige_admin_y_mismo_pais():
    db, llamar = _guardar(ANALISTA, cargo_ok=True)
    assert _status(llamar) == 403 and "INSERT" not in db.sql
    db, llamar = _guardar(ADMIN, cargo_ok=False)
    assert _status(llamar) == 400 and "INSERT" not in db.sql
    db, llamar = _guardar(ADMIN, cargo_ok=True)
    assert llamar() == {"id": 7}
    assert db.llamadas[0][1] == {"cargo_empresa_id": 5, "estudio_id": 1}
    assert db.llamadas[-1][1]["cargo_empresa_id"] == 5


def test_analisis_sin_cargo_empresa_no_exige_admin():
    db, llamar = _guardar(ANALISTA, cargo_ok=False, cargo_empresa_id=None)
    assert llamar() == {"id": 7}
    assert "cargo_empresa ce" not in db.sql and db.llamadas[-1][1]["cargo_empresa_id"] is None


def test_acceso_por_pais():
    admin = FakeSession({"FROM compensaciones.acceso": [{"admin": True, "paises": []}]})
    assert router._acceso(admin, SimpleNamespace(username="gpavez")) == ("gpavez", True, None)
    assert admin.llamadas[-1][1] == {"username": "gpavez"}
    assert router._acceso(FakeSession({}), SimpleNamespace(username="nadie")) == ("nadie", False, [])
    db = FakeSession({"FROM compensaciones.acceso": [{"admin": False, "paises": ["PE"]}]})
    peru = router._acceso(db, SimpleNamespace(username="rrhh_pe"))
    assert peru == ("rrhh_pe", False, ["PE"])

    router.estudios(db, peru)
    assert db.llamadas[-1][1] == {"paises": ["PE"]}
    router.estudios(db, router.Acceso("gpavez", True, None))
    assert db.llamadas[-1][1] == {"paises": None}

    # estudio de Chile para un usuario de Perú: 404 antes de llamar a la IA; el admin pasa
    db = FakeSession({"FROM compensaciones.estudio WHERE": [ESTUDIO]})
    assert _status(lambda: router.cargos_empresa(1, db, peru)) == 404 and "cargo_empresa ce" not in db.sql
    router._permitir(db, router.Acceso("gpavez", True, None), 1)


def main():
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if not nombre.startswith("test_"):
            continue
        try:
            fn()
            print(f"  OK   {nombre}")
        except AssertionError as e:
            fallos += 1
            print(f"  FAIL {nombre}: {e}")
    print("todo verde" if not fallos else f"{fallos} fallo(s)")
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
