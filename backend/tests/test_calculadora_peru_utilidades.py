"""Self-check de los adicionales anuales de Perú (calculadora).

EL REPARTO DE UTILIDADES ESTÁ EN PAUSA: el servicio devuelve 0 y no consulta
rh_peru, así que todo lo que verificaba ese cálculo quedó comentado acá abajo.
Se reactiva junto con el bloque comentado de `proyeccion_utilidades_peru`.

No toca la BD: usa una sesión falsa que responde a las dos queries de
rh_peru y una fila de country_config en memoria.

Ejecutar:
    python -m tests.test_calculadora_peru_utilidades
"""

from datetime import date
from decimal import Decimal

from fastapi import HTTPException

from app.repositories.calculadora_repo import (
    CalculadoraRepository,
    SQL_PERU_DIAS_TRABAJADOS,
    SQL_PERU_SUELDOS_ACTIVOS,
)
from app.schemas.calculadora import ProyeccionUtilidadesPeruIn
from app.services.calculadora_service import CalculadoraService


TASAS_OK = {
    "SUELDOS_ANUALES": 14,
    "SUELDO_MINIMO": 1130,
    "ASIGNACION_FAMILIAR_PCT": 0.10,
    "CANASTA_NAVIDENA_MONTO": 200,
    "BASE_DIAS_PROYECCION": 360,
    "TOPE_UTILIDADES_MESES": 18,
    "PORCENTAJE_UTILIDADES_SECTOR": 0.10,
}


class _FakeRow:
    """Fila de calculadora.country_config."""

    def __init__(self, tasas, pais="peru"):
        self.pais = pais
        self.afp_data = {"Integra": 0.0155}
        self.uf_value = 1
        self.dolar_value = Decimal("3.4198")
        self.tax_brackets = []
        self.bonos_anuales_uf = None
        self.bonos_empresa = []
        self.tasas = tasas
        self.updated_at = None
        self.afp_updated_at = None
        self.uf_updated_at = None
        self.tasas_updated_at = None
        self.tax_brackets_updated_at = None
        self.dolar_updated_at = None


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar(self):
        return self._value


class _FakeDb:
    """Registra las queries ejecutadas para poder inspeccionarlas."""

    def __init__(self, sueldos=0, dias=0):
        self.sueldos = sueldos
        self.dias = dias
        self.calls = []  # [(sql_text, params)]

    def execute(self, stmt, params=None):
        sql = str(stmt)
        self.calls.append((sql, params))
        if "historical_settlements" in sql:
            return _FakeResult(self.dias)
        return _FakeResult(self.sueldos)


class _FakeRepo(CalculadoraRepository):
    def __init__(self, db, tasas=TASAS_OK, pais="peru"):
        super().__init__(db)
        self._row = _FakeRow(tasas, pais) if tasas is not None else None

    def get_country_config(self, pais):
        return self._row


def _service(sueldos=100000, dias=6000, tasas=TASAS_OK):
    db = _FakeDb(sueldos=sueldos, dias=dias)
    svc = CalculadoraService(_FakeRepo(db, tasas))
    CalculadoraService.invalidate_cache()
    return svc, db


def _req(**kw):
    base = dict(
        sueldo_base_calculado=3500,
        renta_imponible_proyectada=500000,
        porcentaje_utilidades=0.10,
        tiene_asignacion_familiar=False,
    )
    base.update(kw)
    return ProyeccionUtilidadesPeruIn(**base)


def _formula(sueldos_mensual, dias_actual, sueldo_base, pct,
             asignacion=False, renta=500000):
    """Reimplementación directa de la fórmula del enunciado, para contrastar."""
    d = Decimal
    sueldos_anuales = d(14)
    asig_mensual = d("1130") * d("0.10") if asignacion else d(0)
    empresa_sueldos = d(str(sueldos_mensual)) * sueldos_anuales
    nuevo_anual = (d(str(sueldo_base)) + asig_mensual) * sueldos_anuales
    nuevos_dias = d(360)
    pozo = d(str(renta)) * d(str(pct))
    preliminar = (
        nuevos_dias * ((pozo / 2) / (d(str(dias_actual)) + nuevos_dias))
        + nuevo_anual * ((pozo / 2) / (empresa_sueldos + nuevo_anual))
    )
    tope = d(18) * d(str(sueldo_base))
    return float(round(min(preliminar, tope), 2))


def check(nombre, cond):
    assert cond, f"FALLO: {nombre}"
    print(f"  ok  {nombre}")


def _espera_http(nombre, fn, status):
    try:
        fn()
    except HTTPException as e:
        check(f"{nombre} -> HTTP {status}", e.status_code == status)
        return
    raise AssertionError(f"FALLO: {nombre} no levanto HTTPException")


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

def test_sql_shape():
    print("\n[SQL]")
    sueldos = str(SQL_PERU_SUELDOS_ACTIVOS)
    dias = str(SQL_PERU_DIAS_TRABAJADOS)

    check("sueldos filtra status = activo", "e.status = 'activo'" in sueldos)
    check("sueldos NO toca historical_settlements",
          "historical_settlements" not in sueldos)
    check("dias filtra status = activo", "e.status = 'activo'" in dias)
    check("dias hace JOIN por document_number",
          "e.document_number = hs.document_number" in dias)
    check("dias filtra pay_period >= inicio y < anio siguiente",
          "hs.pay_period >= :inicio_anio_actual" in dias
          and "hs.pay_period < :inicio_anio_siguiente" in dias)
    check("dias NO suma base_wage (no se duplica por liquidacion)",
          "base_wage" not in dias)
    check("dias suma hs.dias_trabajados", "SUM(hs.dias_trabajados)" in dias)


def test_repo_params():
    print("\n[Repositorio]")
    db = _FakeDb(sueldos=123, dias=45)
    repo = CalculadoraRepository(db)

    check("sueldos devuelve Decimal",
          repo.get_peru_sueldo_base_mensual_activo() == Decimal("123"))
    check("dias devuelve Decimal",
          repo.get_peru_dias_trabajados(date(2026, 1, 1), date(2027, 1, 1)) == Decimal("45"))

    _, params = db.calls[-1]
    check("las fechas van como bind params (SQL parametrizada)",
          params == {"inicio_anio_actual": date(2026, 1, 1),
                     "inicio_anio_siguiente": date(2027, 1, 1)})

    repo_null = CalculadoraRepository(_FakeDb(sueldos=None, dias=None))
    check("NULL -> Decimal(0)",
          repo_null.get_peru_sueldo_base_mensual_activo() == Decimal("0"))


# EN PAUSA — el servicio ya no consulta rh_peru
# def test_anio_calendario_backend():
#     print("\n[Anio calendario]")
#     svc, db = _service()
#     svc.proyeccion_utilidades_peru(_req())
#     params = [p for _, p in db.calls if p][-1]
#     anio = date.today().year
#     check("inicio = 1-ene del anio actual",
#           params["inicio_anio_actual"] == date(anio, 1, 1))
#     check("fin = 1-ene del anio siguiente",
#           params["inicio_anio_siguiente"] == date(anio + 1, 1, 1))


# ---------------------------------------------------------------------------
# Cálculo
# ---------------------------------------------------------------------------

def test_asignacion_familiar():
    print("\n[Asignacion familiar]")
    svc, _ = _service()
    off = svc.proyeccion_utilidades_peru(_req(tiene_asignacion_familiar=False))
    check("desactivada -> 0 mensual", off["asignacion_familiar_mensual"] == 0.0)
    check("desactivada -> 0 anual", off["asignacion_familiar_anual"] == 0.0)

    svc, _ = _service()
    on = svc.proyeccion_utilidades_peru(_req(tiene_asignacion_familiar=True))
    check("activada -> 1130 x 10% = 113", on["asignacion_familiar_mensual"] == 113.0)
    check("activada -> 113 x 14 = 1582 anual", on["asignacion_familiar_anual"] == 1582.0)
    check("canasta navidena sale de BD", on["canasta_navidena_anual"] == 200.0)
    check("reparto de utilidades en pausa -> 0", on["reparto_utilidades_estimado"] == 0.0)
    check("total adicional = asignacion + canasta",
          abs(on["total_adicional_anual"]
              - (on["asignacion_familiar_anual"] + on["canasta_navidena_anual"])) < 0.01)
    # EN PAUSA — el reparto reaccionaba a la asignación familiar:
    # check("activada sube la remuneracion anual proyectada",
    #       on["nuevo_sueldo_anual"] > off["nuevo_sueldo_anual"])
    # check("activada sube el reparto estimado",
    #       on["reparto_utilidades_estimado"] > off["reparto_utilidades_estimado"])
    # check("activada coincide con la formula",
    #       abs(on["reparto_utilidades_estimado"]
    #           - _formula(100000, 6000, 3500, 0.10, asignacion=True)) < 0.02)


# EN PAUSA — fórmula del reparto de utilidades
# def test_formula_y_porcentajes():
#     print("\n[Formula / porcentaje]")
#     svc, _ = _service(sueldos=100000, dias=6000)
#     r_default = svc.proyeccion_utilidades_peru(_req(porcentaje_utilidades=0.10))
#     check("reparto coincide con la formula del enunciado",
#           abs(r_default["reparto_utilidades_estimado"]
#               - _formula(100000, 6000, 3500, 0.10)) < 0.02)
#     check("% por defecto expuesto desde BD (0.10)",
#           r_default["porcentaje_utilidades_default"] == 0.10)
#
#     svc, _ = _service(sueldos=100000, dias=6000)
#     r_user = svc.proyeccion_utilidades_peru(_req(porcentaje_utilidades=0.05))
#     check("% editado por el usuario cambia el resultado (mitad del pozo)",
#           abs(r_user["reparto_utilidades_estimado"]
#               - r_default["reparto_utilidades_estimado"] / 2) < 0.02)
#
#     check("pozo = renta x porcentaje", r_user["pozo_total"] == 25000.0)
#     check("canasta navidena sale de BD", r_default["canasta_navidena_anual"] == 200.0)
#     check("total adicional = reparto + asignacion + canasta",
#           abs(r_default["total_adicional_anual"]
#               - (r_default["reparto_utilidades_estimado"]
#                  + r_default["asignacion_familiar_anual"]
#                  + r_default["canasta_navidena_anual"])) < 0.01)


# EN PAUSA — tope de 18 remuneraciones del reparto
# def test_tope():
#     print("\n[Tope de utilidades]")
#     svc, _ = _service(sueldos=100000, dias=6000)
#     sin_tope = svc.proyeccion_utilidades_peru(_req(renta_imponible_proyectada=500000))
#     check("no aplica tope con renta normal", sin_tope["tope_aplicado"] is False)
#     check("reparto = preliminar cuando no hay tope",
#           sin_tope["reparto_utilidades_estimado"] == sin_tope["utilidad_preliminar"])
#
#     svc, _ = _service(sueldos=100000, dias=6000)
#     con_tope = svc.proyeccion_utilidades_peru(_req(renta_imponible_proyectada=900000000))
#     check("aplica tope con renta enorme", con_tope["tope_aplicado"] is True)
#     check("tope = 18 x 3500 = 63000", con_tope["tope_utilidad"] == 63000.0)
#     check("reparto queda topado", con_tope["reparto_utilidades_estimado"] == 63000.0)


# EN PAUSA — denominador del reparto
# def test_canasta_fuera_del_denominador():
#     print("\n[Canasta fuera del denominador]")
#     svc, _ = _service()
#     base = svc.proyeccion_utilidades_peru(_req())["reparto_utilidades_estimado"]
#
#     svc, _ = _service(tasas={**TASAS_OK, "CANASTA_NAVIDENA_MONTO": 99999})
#     otra = svc.proyeccion_utilidades_peru(_req())
#     check("subir la canasta no mueve el reparto de utilidades",
#           otra["reparto_utilidades_estimado"] == base)
#     check("subir la canasta no mueve la remuneracion anual proyectada",
#           otra["nuevo_sueldo_anual"] == 3500 * 14)


# ---------------------------------------------------------------------------
# Validaciones
# ---------------------------------------------------------------------------

def test_validaciones():
    print("\n[Validaciones]")
    faltante = {k: v for k, v in TASAS_OK.items() if k != "CANASTA_NAVIDENA_MONTO"}
    svc, _ = _service(tasas=faltante)
    _espera_http("configuracion incompleta",
                 lambda: svc.proyeccion_utilidades_peru(_req()), 503)

    svc, _ = _service(tasas={})
    try:
        svc.proyeccion_utilidades_peru(_req())
    except HTTPException as e:
        check("el error nombra los factores faltantes",
              "CANASTA_NAVIDENA_MONTO" in e.detail and "SUELDO_MINIMO" in e.detail)

    # EN PAUSA — sin consulta a rh_peru ya no hay 409 por nómina vacía:
    # svc, _ = _service(sueldos=0)
    # _espera_http("sin empleados activos",
    #              lambda: svc.proyeccion_utilidades_peru(_req()), 409)
    #
    # svc, _ = _service(dias=0)
    # _espera_http("sin dias trabajados",
    #              lambda: svc.proyeccion_utilidades_peru(_req()), 409)

    svc, _ = _service(tasas={**TASAS_OK, "SUELDOS_ANUALES": 0})
    _espera_http("SUELDOS_ANUALES = 0 (division por cero)",
                 lambda: svc.proyeccion_utilidades_peru(_req()), 503)

    for campo, valor in [("sueldo_base_calculado", -1),
                         ("renta_imponible_proyectada", -1),
                         ("porcentaje_utilidades", -0.1),
                         ("porcentaje_utilidades", 1.5)]:
        rechazado = False
        try:
            _req(**{campo: valor})
        except Exception:
            rechazado = True
        check(f"{campo}={valor} rechazado por el schema", rechazado)


# EN PAUSA — ya no se consulta la nómina, no hay nada que cachear
# def test_cache():
#     print("\n[Cache de nomina]")
#     svc, db = _service()
#     svc.proyeccion_utilidades_peru(_req())
#     n = len([c for c in db.calls if "rh_peru" in c[0]])
#     check("primera llamada consulta rh_peru (2 queries)", n == 2)
#
#     svc.proyeccion_utilidades_peru(_req(porcentaje_utilidades=0.07))
#     check("segunda llamada no vuelve a consultar rh_peru",
#           len([c for c in db.calls if "rh_peru" in c[0]]) == n)
#
#     CalculadoraService.invalidate_cache()
#     svc.proyeccion_utilidades_peru(_req())
#     check("invalidate_cache limpia tambien las metricas de nomina",
#           len([c for c in db.calls if "rh_peru" in c[0]]) == 2 * n)


def test_chile_brasil_intactos():
    print("\n[Chile / Brasil]")
    db = _FakeDb()
    svc = CalculadoraService(_FakeRepo(db, tasas={"SUELDO_MINIMO": 539000}, pais="chile"))
    CalculadoraService.invalidate_cache()

    cfg = svc.get_country_config("chile")
    check("config Chile sigue devolviendo el mismo contrato",
          set(["afpData", "ufValue", "dolarValue", "taxBrackets",
               "bonosAnualesUF", "bonosEmpresa", "tasas", "_meta"]) <= set(cfg))
    check("config Chile no dispara ninguna query de rh_peru",
          all("rh_peru" not in sql for sql, _ in db.calls))

    CalculadoraService.invalidate_cache()
    cfg_br = svc.get_country_config("brasil")
    check("config Brasil sigue respondiendo", "tasas" in cfg_br)
    check("Brasil tampoco toca rh_peru",
          all("rh_peru" not in sql for sql, _ in db.calls))


if __name__ == "__main__":
    test_sql_shape()
    test_repo_params()
    test_asignacion_familiar()
    test_validaciones()
    test_chile_brasil_intactos()
    # EN PAUSA — reparto de utilidades:
    # test_anio_calendario_backend()
    # test_formula_y_porcentajes()
    # test_tope()
    # test_canasta_fuera_del_denominador()
    # test_cache()
    print("\nTodo OK\n")
