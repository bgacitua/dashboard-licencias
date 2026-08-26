"""Self-check de Costos por país (Chile / Perú).

Verifica que el país sólo cambie el origen de los datos y que ese origen salga
siempre del mapa cerrado COUNTRY_SOURCES. No toca la BD: usa una sesión falsa
que captura el SQL emitido.

Ejecutar:
    python -m tests.test_costos_peru
"""

import re
from datetime import date

from app.repositories.costos_repo import COUNTRY_SOURCES, CostosRepository
from app.schemas.costos import FilterRequest
from app.services import costos_service as svc


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def scalar(self):
        return 0

    def first(self):
        return (date(2026, 6, 1),)


class FakeSession:
    """Captura el SQL ejecutado y devuelve filas fijas."""

    def __init__(self, rows=()):
        self.sqls: list[str] = []
        self.rows = list(rows)

    def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        return _Result(self.rows)

    @property
    def sql(self) -> str:
        return "\n".join(self.sqls)


VISTAS_PERU = set(COUNTRY_SOURCES["peru"].values())
VISTAS_CHILE = set(COUNTRY_SOURCES["chile"].values())


def _filtros(pais: str, **extra) -> FilterRequest:
    return FilterRequest(
        pais=pais,
        fecha_inicio=date(2026, 6, 1),
        fecha_fin=date(2026, 6, 30),
        **extra,
    )


def test_pais_invalido_no_llega_a_sql():
    for pais in ["", "PERU", "chile; drop table", "costos.mv_costos_colaboradores", None]:
        try:
            CostosRepository(FakeSession(), pais)
        except ValueError:
            continue
        raise AssertionError(f"país {pais!r} debió ser rechazado")


def test_fuentes_no_se_cruzan():
    """Cada país consulta sólo sus vistas; ninguna consulta menciona las del otro."""
    for pais, propias, ajenas in [
        ("peru", VISTAS_PERU, VISTAS_CHILE - VISTAS_PERU),
        ("chile", VISTAS_CHILE, VISTAS_PERU - VISTAS_CHILE),
    ]:
        db = FakeSession()
        repo = CostosRepository(db, pais)
        f = _filtros(pais, jefatura_rut="1234", conceptos=["Sueldo"])
        repo.get_dimensiones(empresas=["X"])
        repo.get_income_types()
        repo.get_conceptos()
        repo.buscar_personas("juan")
        repo.buscar_jefes("juan", empresas=["X"])
        repo.get_max_pay_period(f, dentro_del_periodo=True)
        repo.costo_total(f)
        repo.costo_mes_con_desglose(f, date(2026, 6, 1))
        repo.headcount_mes(f, date(2026, 6, 1))
        repo.serie_mensual(f)
        repo.jerarquia_treemap(f)
        repo.top_personas(f)

        assert db.sqls, "no se emitió SQL"
        # Conjunto exacto de objetos costos.* tocados: ni de mas (fuga al otro
        # pais) ni de menos (algun metodo quedo con la fuente fija).
        usadas = set(re.findall(r'costos\.\w+', db.sql))
        assert usadas == propias, (
            f'{pais}: sobran {sorted(usadas - propias)}, '
            f'faltan {sorted(propias - usadas)}'
        )
        assert not (usadas & ajenas), f'{pais}: se filtraron vistas ajenas'


def test_jefatura_usa_la_jerarquia_del_pais():
    db = FakeSession()
    repo = CostosRepository(db, "peru")
    repo.costo_total(_filtros("peru", jefatura_rut="44261568"))
    assert "costos.v_jerarquia_jefatura_peru" in db.sql
    assert "mv_jerarquia_jefatura" not in db.sql


def test_filtros_van_parametrizados():
    """Los valores del usuario nunca se interpolan en el SQL."""
    db = FakeSession()
    repo = CostosRepository(db, "peru")
    repo.costo_total(_filtros("peru", persona_rut="07884700", cargo="GERENTE"))
    assert "07884700" not in db.sql and "GERENTE" not in db.sql
    assert ":persona_rut" in db.sql and ":cargo" in db.sql


def test_cache_de_catalogos_segmentada_por_pais():
    svc._cache_conceptos.clear()
    db_cl = FakeSession(rows=[("Sueldo Base",)])
    db_pe = FakeSession(rows=[("Essalud",)])
    s_cl = svc.CostosService(CostosRepository(db_cl, "chile"))
    s_pe = svc.CostosService(CostosRepository(db_pe, "peru"))

    assert s_cl.get_conceptos() == ["Sueldo Base"]
    assert s_pe.get_conceptos() == ["Essalud"], "Perú reusó el catálogo de Chile"
    assert s_cl.get_conceptos() == ["Sueldo Base"]
    assert len(db_cl.sqls) == 1, "la caché de Chile no se usó"


def test_comparar_hereda_el_pais_del_repositorio():
    from app.schemas.costos import SlotInput

    db = FakeSession()
    service = svc.CostosService(CostosRepository(db, "peru"))
    service.comparar(
        date(2026, 6, 1),
        date(2026, 6, 30),
        [SlotInput(id="A", tipo="persona", valor={"rut": "44261568"})],
    )
    assert "costos.v_costos_colaboradores_peru" in db.sql
    assert "costos.mv_costos_colaboradores" not in db.sql


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
