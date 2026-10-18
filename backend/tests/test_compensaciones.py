"""Self-check del módulo Compensaciones. No toca la BD ni OpenAI: usa una sesión
falsa que captura el SQL y `ia` parchado.

Ejecutar:
    python -m tests.test_compensaciones
"""
from fastapi import HTTPException

from app.modules.compensaciones import ia, service
from app.modules.compensaciones.config import settings

ESTUDIO = {"id": 1, "vista": "2025 CL TRS", "pais": "CL", "anio": 2025, "moneda": "CLP", "factor_mensual": 12}
ANALISIS = {"id": 7, "estudio_id": 1}


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
    out = service.match(_db_match([_cand(1, 0.8), _cand(2, 0.6)]), 1, "Comprador", None, "gabriel")
    assert out["fuente"] == "coseno"
    assert [c["score"] for c in out["candidatos"]] == [80.0, 60.0]
    assert out["analisis_id"] == 7


def test_ordena_por_score_y_corta():
    cands = [_cand(i, 0.9 - i / 100) for i in range(1, 8)]
    # GPT puntúa al revés del orden de entrada: el último candidato es el mejor.
    _con_ia(lambda *a: [{"candidato_numero": i, "score": i * 10, "justificacion": "ok"} for i in range(1, 8)])
    out = service.match(_db_match(cands), 1, "Comprador", "Compra insumos", "gabriel")
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
            "FROM compensaciones.analisis": [ANALISIS],
            "GROUP BY n.codigo": [{"codigo": "M20", "nombre": "x"}],
            "FROM compensaciones.estudio WHERE": [ESTUDIO],
            "GROUP BY m.medida_codigo": [hib],
            "CASE WHEN m.es_core": [fila],
        })
        out = service.resultado(db, 7, cargos, "M20")
        assert sum(f["tipo"] == "hibrido" for f in out["filas"]) == esperado
        assert out["moneda"] == "CLP"


def test_promedio_de_subfamilias_solo_con_mas_de_una():
    def sub(cod, v):
        return {"tipo": "subfamilia", "cargo_codigo": cod, "titulo": cod, "medida_codigo": "COMP1",
                "n_companias": 5, "n_observaciones": 5, "p25": v, "mediana": v, "promedio": v, "p75": None}

    for subs, esperado in (([sub("SCN.03.000", 10)], 0), ([sub("SCN.03.000", 10), sub("HRM.02.000", 30)], 1)):
        db = FakeSession({
            "FROM compensaciones.analisis": [ANALISIS],
            "GROUP BY n.codigo": [{"codigo": "M20", "nombre": "x"}],
            "FROM compensaciones.estudio WHERE": [ESTUDIO],
            "CASE WHEN m.es_core": subs,
        })
        out = service.resultado(db, 7, ["SCN.03.017"], "M20")
        prom = [f for f in out["filas"] if f["tipo"] == "promedio_subfamilias" and f["medida_codigo"] == "COMP1"]
        assert len(prom) == esperado
        if esperado:
            assert prom[0]["mediana"] == 20 and prom[0]["p75"] is None  # p75 s/d en una -> s/d


def test_inexistentes_404_y_nivel_400():
    _con_ia(lambda *a: None)
    for llamar in (
        lambda: service.match(_db_match([], estudio=None), 99, "X", None, "u"),
        lambda: service.resultado(FakeSession({}), 99, ["SCN.03.017"], "M20"),
    ):
        try:
            llamar()
        except HTTPException as e:
            assert e.status_code == 404
        else:
            raise AssertionError("debió responder 404")

    db = FakeSession({"FROM compensaciones.analisis": [ANALISIS], "GROUP BY n.codigo": [{"codigo": "M10", "nombre": "x"}]})
    try:
        service.resultado(db, 7, ["SCN.03.017"], "M20")
    except HTTPException as e:
        assert e.status_code == 400
    else:
        raise AssertionError("debió responder 400")
    assert "UPDATE" not in db.sql


def test_valores_del_usuario_viajan_como_parametros():
    _con_ia(lambda *a: None)
    nombre = "Comprador'; DROP TABLE x; --"
    db = _db_match([_cand(1, 0.8)])
    service.match(db, 1, nombre, "desc", "gabriel")
    assert nombre not in db.sql and "gabriel" not in db.sql
    assert any(p.get("cargo_nombre") == nombre and p.get("usuario") == "gabriel" for _, p in db.llamadas)


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
