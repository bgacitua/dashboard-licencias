"""Self-check de los aportes patronales de Perú (calculadora).

Cubre la validación de `tasas.APORTES_PATRONALES` y cómo el payload de
configuración expone errores y advertencias. No toca la BD: usa una fila de
country_config en memoria.

Ejecutar:
    python -m tests.test_calculadora_peru_aportes
"""

from datetime import datetime, timezone

from app.repositories.calculadora_repo import CalculadoraRepository
from app.services.calculadora_service import (
    CalculadoraService,
    validar_aportes_patronales_peru,
    validar_config_brasil,
    validar_impuesto_5ta_peru,
)


APORTES_OK = [
    {"id": "eps", "nombre": "EPS", "tipo": "porcentaje",
     "tasa": 0.0225, "base": "imponible", "activo": True},
    {"id": "essalud", "nombre": "EsSalud", "tipo": "porcentaje",
     "tasa": 0.0675, "base": "imponible", "activo": True},
    {"id": "sctr_salud", "nombre": "SCTR Salud", "tipo": "porcentaje",
     "tasa": 0.007, "base": "imponible", "activo": True},
    {"id": "sctr_pension", "nombre": "SCTR Pensión", "tipo": "porcentaje_con_tope",
     "tasa": 0.007, "base": "imponible", "tope": 12598.57, "activo": True},
    {"id": "vida_ley", "nombre": "Vida Ley", "tipo": "porcentaje_con_tope",
     "tasa": 0.0027, "base": "imponible", "tope": 12600, "activo": True},
]

TRAMOS_OK = [
    {"desde_uf": 0, "hasta_uf": 5, "tasa": 0.08},
    {"desde_uf": 5, "hasta_uf": 20, "tasa": 0.14},
    {"desde_uf": 20, "hasta_uf": 35, "tasa": 0.17},
    {"desde_uf": 35, "hasta_uf": 45, "tasa": 0.20},
    {"desde_uf": 45, "hasta_uf": None, "tasa": 0.30},
]

TASAS_PERU = {
    "UIT": 5500,
    "SUELDO_MINIMO": 1130,
    "TASA_AFP_OBLIGATORIA": 0.10,
    "TASA_SEGUROS_INVALIDEZ": 0.0137,
    "TASA_SALUD_PATRONAL": 0.09,
    "SUELDOS_ANUALES": 14,
    "DEDUCCION_FIJA_UIT": 7,
    "TRAMOS_IMPUESTO": TRAMOS_OK,
    "APORTES_PATRONALES": APORTES_OK,
}


def check(nombre, cond):
    assert cond, f"FALLO: {nombre}"
    print(f"  ok  {nombre}")


class _FilaFake:
    def __init__(self, pais, tasas):
        ahora = datetime.now(timezone.utc)
        self.pais = pais
        self.tasas = tasas
        self.afp_data = {"Integra": 0.0155}
        self.uf_value = 1
        self.dolar_value = 3.42
        self.tax_brackets = []
        self.bonos_anuales_uf = None
        self.bonos_empresa = []
        self.uf_updated_at = ahora
        self.dolar_updated_at = ahora
        self.afp_updated_at = ahora
        self.tasas_updated_at = ahora
        self.tax_brackets_updated_at = ahora
        self.updated_at = ahora


class _FakeRepo(CalculadoraRepository):
    def __init__(self, tasas):
        self._tasas = tasas

    def get_country_config(self, pais):
        return _FilaFake(pais, self._tasas)


def _config(tasas, pais="peru"):
    CalculadoraService.invalidate_cache()
    return CalculadoraService(_FakeRepo(tasas)).get_country_config(pais)


def test_catalogo_valido():
    print("\n[Catálogo válido]")
    check("no reporta errores", validar_aportes_patronales_peru(TASAS_PERU) == [])
    check(
        "EPS 2,25% + EsSalud 6,75% = 9%",
        round(APORTES_OK[0]["tasa"] + APORTES_OK[1]["tasa"], 6) == 0.09,
    )
    check("los cinco aportes históricos están presentes",
          {a["id"] for a in APORTES_OK} ==
          {"eps", "essalud", "sctr_salud", "sctr_pension", "vida_ley"})


def test_catalogo_ausente_no_es_error():
    print("\n[Sin catálogo: advertencia, no error]")
    sin_catalogo = {k: v for k, v in TASAS_PERU.items() if k != "APORTES_PATRONALES"}
    check("no hay configErrors", validar_aportes_patronales_peru(sin_catalogo) == [])

    payload = _config(sin_catalogo)
    check("configErrors vacío", payload["_meta"]["configErrors"] == [])
    check(
        "pero advierte la caída transitoria a EsSalud 9%",
        any("APORTES_PATRONALES" in w for w in payload["_meta"]["warnings"]),
    )

    con_catalogo = _config(TASAS_PERU)
    check(
        "con catálogo no advierte",
        not any("APORTES_PATRONALES" in w for w in con_catalogo["_meta"]["warnings"]),
    )


def test_ids_unicos():
    print("\n[IDs únicos]")
    errores = validar_aportes_patronales_peru({
        "APORTES_PATRONALES": [APORTES_OK[0], {**APORTES_OK[0], "tasa": 0.5}]
    })
    check("detecta el identificador repetido",
          any("repetido" in e for e in errores))

    errores = validar_aportes_patronales_peru({
        "APORTES_PATRONALES": [{"nombre": "Sin id", "tipo": "porcentaje", "tasa": 0.01}]
    })
    check("exige 'id'", any("'id' es obligatorio" in e for e in errores))


def test_tipos_validos():
    print("\n[Tipos admitidos]")
    for tipo in ("porcentaje", "porcentaje_con_tope", "monto_fijo"):
        aporte = {"id": "x", "nombre": "X", "tipo": tipo, "tasa": 0.01, "tope": 100, "monto": 50}
        check(f"'{tipo}' es válido",
              validar_aportes_patronales_peru({"APORTES_PATRONALES": [aporte]}) == [])

    errores = validar_aportes_patronales_peru({
        "APORTES_PATRONALES": [{"id": "x", "nombre": "X", "tipo": "porcentaje_de_algo", "tasa": 0.01}]
    })
    check("rechaza un tipo desconocido", any("tipo desconocido" in e for e in errores))
    check("y nombra los admitidos", any("porcentaje_con_tope" in e for e in errores))


def test_valores_no_negativos():
    print("\n[Tasas y montos no negativos]")
    casos = [
        ({"id": "x", "nombre": "X", "tipo": "porcentaje", "tasa": -0.01}, "'tasa' no puede ser negativa"),
        ({"id": "x", "nombre": "X", "tipo": "porcentaje", "tasa": "0.01"}, "'tasa' debe ser numérica"),
        ({"id": "x", "nombre": "X", "tipo": "monto_fijo", "monto": -5}, "'monto' no puede ser negativo"),
        ({"id": "x", "nombre": "X", "tipo": "monto_fijo"}, "'monto' debe ser numérico"),
    ]
    for aporte, esperado in casos:
        errores = validar_aportes_patronales_peru({"APORTES_PATRONALES": [aporte]})
        check(f"detecta: {esperado}", any(esperado in e for e in errores))

    check(
        "tasa 0 es válida (aporte desactivado por tasa)",
        validar_aportes_patronales_peru({
            "APORTES_PATRONALES": [{"id": "x", "nombre": "X", "tipo": "porcentaje", "tasa": 0}]
        }) == [],
    )


def test_tope_obligatorio_en_porcentaje_con_tope():
    print("\n[Tope obligatorio y positivo]")
    sin_tope = {"id": "sctr_pension", "nombre": "SCTR Pensión",
                "tipo": "porcentaje_con_tope", "tasa": 0.007}
    errores = validar_aportes_patronales_peru({"APORTES_PATRONALES": [sin_tope]})
    check("exige 'tope'", any("'tope' es obligatorio" in e for e in errores))

    errores = validar_aportes_patronales_peru({"APORTES_PATRONALES": [{**sin_tope, "tope": 0}]})
    check("rechaza tope 0", any("mayor que cero" in e for e in errores))

    errores = validar_aportes_patronales_peru({"APORTES_PATRONALES": [{**sin_tope, "tope": -1}]})
    check("rechaza tope negativo", any("mayor que cero" in e for e in errores))

    check("acepta tope positivo",
          validar_aportes_patronales_peru({"APORTES_PATRONALES": [{**sin_tope, "tope": 12598.57}]}) == [])
    check(
        "el tope no se exige en 'porcentaje'",
        validar_aportes_patronales_peru({
            "APORTES_PATRONALES": [{"id": "x", "nombre": "X", "tipo": "porcentaje", "tasa": 0.007}]
        }) == [],
    )


def test_base_soportada():
    print("\n[Base soportada]")
    check(
        "'imponible' es válida",
        validar_aportes_patronales_peru({
            "APORTES_PATRONALES": [{"id": "x", "nombre": "X", "tipo": "porcentaje",
                                    "tasa": 0.01, "base": "imponible"}]
        }) == [],
    )
    errores = validar_aportes_patronales_peru({
        "APORTES_PATRONALES": [{"id": "x", "nombre": "X", "tipo": "porcentaje",
                                "tasa": 0.01, "base": "bruto_anual"}]
    })
    check("rechaza otra base", any("no soportada" in e for e in errores))


def test_estructura_invalida():
    print("\n[Estructura inválida]")
    check(
        "el catálogo debe ser una lista",
        validar_aportes_patronales_peru({"APORTES_PATRONALES": {"eps": 0.0225}}) ==
        ["APORTES_PATRONALES debe ser una lista de aportes"],
    )
    errores = validar_aportes_patronales_peru({"APORTES_PATRONALES": ["eps"]})
    check("cada ítem debe ser un objeto", any("debe ser un objeto" in e for e in errores))


def test_payload_expone_errores():
    print("\n[La configuración inválida llega a la vista]")
    rotas = {**TASAS_PERU, "APORTES_PATRONALES": [
        APORTES_OK[0],
        {**APORTES_OK[0], "nombre": "EPS duplicado"},
        {"id": "sctr_pension", "nombre": "SCTR Pensión",
         "tipo": "porcentaje_con_tope", "tasa": 0.007},
    ]}
    payload = _config(rotas)
    errores = payload["_meta"]["configErrors"]
    check("configErrors no viene vacío", len(errores) == 2)
    check("reporta el id repetido", any("repetido" in e for e in errores))
    check("reporta el tope faltante", any("'tope' es obligatorio" in e for e in errores))
    check("las tasas siguen expuestas para el frontend", payload["tasas"] == rotas)

    ok = _config(TASAS_PERU)
    check("con catálogo válido no hay errores", ok["_meta"]["configErrors"] == [])


def test_impuesto_5ta_factores():
    print("\n[Impuesto 5ta: factores obligatorios]")
    check("config completa no reporta errores", validar_impuesto_5ta_peru(TASAS_PERU) == [])

    for clave in ("UIT", "SUELDOS_ANUALES", "DEDUCCION_FIJA_UIT", "TRAMOS_IMPUESTO"):
        faltante = {k: v for k, v in TASAS_PERU.items() if k != clave}
        errores = validar_impuesto_5ta_peru(faltante)
        check(f"sin {clave} se reporta", any(clave in e for e in errores))

    check("UIT en 0 se reporta (daría impuesto 0 en silencio)",
          any("UIT" in e for e in validar_impuesto_5ta_peru({**TASAS_PERU, "UIT": 0})))
    check("DEDUCCION_FIJA_UIT en 0 es válida (no todos deducen)",
          validar_impuesto_5ta_peru({**TASAS_PERU, "DEDUCCION_FIJA_UIT": 0}) == [])
    check("TRAMOS_IMPUESTO vacío se reporta",
          any("TRAMOS_IMPUESTO" in e for e in
              validar_impuesto_5ta_peru({**TASAS_PERU, "TRAMOS_IMPUESTO": []})))


def test_impuesto_5ta_tramos():
    print("\n[Impuesto 5ta: forma de los tramos]")
    check("el orden en la BD no importa: se ordenan antes de validar",
          validar_impuesto_5ta_peru({**TASAS_PERU, "TRAMOS_IMPUESTO": list(reversed(TRAMOS_OK))}) == [])

    hueco = [TRAMOS_OK[0], {"desde_uf": 8, "hasta_uf": None, "tasa": 0.14}]
    check("hueco entre tramos se reporta",
          any("contiguos" in e for e in validar_impuesto_5ta_peru({**TASAS_PERU, "TRAMOS_IMPUESTO": hueco})))

    cerrado = TRAMOS_OK[:-1] + [{"desde_uf": 45, "hasta_uf": 100, "tasa": 0.30}]
    check("el último tramo debe quedar abierto",
          any("abierto" in e for e in validar_impuesto_5ta_peru({**TASAS_PERU, "TRAMOS_IMPUESTO": cerrado})))

    abierto_al_medio = [{"desde_uf": 0, "hasta_uf": None, "tasa": 0.08}] + TRAMOS_OK[1:]
    check("un tramo abierto en el medio se reporta",
          any("último tramo" in e for e in
              validar_impuesto_5ta_peru({**TASAS_PERU, "TRAMOS_IMPUESTO": abierto_al_medio})))

    for tasa in (-0.1, 1.5, "8%"):
        check(f"tasa {tasa!r} rechazada",
              any("'tasa'" in e for e in validar_impuesto_5ta_peru(
                  {**TASAS_PERU, "TRAMOS_IMPUESTO": [{"desde_uf": 0, "hasta_uf": None, "tasa": tasa}]})))

    check("tramo que no es objeto se reporta",
          any("objeto" in e for e in validar_impuesto_5ta_peru({**TASAS_PERU, "TRAMOS_IMPUESTO": ["0-5"]})))

    print("\n[La config incompleta de 5ta llega a la vista]")
    CalculadoraService.invalidate_cache()
    sin_uit = {k: v for k, v in TASAS_PERU.items() if k != "UIT"}
    errores = _config(sin_uit)["_meta"]["configErrors"]
    check("configErrors incluye el factor de 5ta faltante", any("UIT" in e for e in errores))


def test_chile_y_brasil_sin_cambios():
    print("\n[Chile y Brasil no se ven afectados]")
    # Chile no valida aportes patronales: su config no los tiene y sigue limpia.
    chile = _config({"TASA_SALUD_FONASA": 0.07}, pais="chile")
    check("Chile sin configErrors", chile["_meta"]["configErrors"] == [])
    check("Chile sin advertencia de aportes",
          not any("APORTES_PATRONALES" in w for w in chile["_meta"]["warnings"]))

    # Brasil conserva su propio validador, no el de Perú.
    tasas_brasil = {"INSS_PATRONAL": 0.20}
    brasil = _config(tasas_brasil, pais="brasil")
    check("Brasil sigue usando validar_config_brasil",
          brasil["_meta"]["configErrors"] == validar_config_brasil(tasas_brasil))
    check("y ese validador reporta lo suyo", len(brasil["_meta"]["configErrors"]) > 0)
    check("Brasil sin advertencia de aportes de Perú",
          not any("APORTES_PATRONALES" in w for w in brasil["_meta"]["warnings"]))

    # Un catálogo roto en Brasil no cambia nada: la validación es sólo de Perú.
    brasil_con_aportes = _config(
        {**tasas_brasil, "APORTES_PATRONALES": [{"id": "x", "tipo": "malo"}]}, pais="brasil"
    )
    check(
        "APORTES_PATRONALES no se valida fuera de Perú",
        not any("tipo desconocido" in e for e in brasil_con_aportes["_meta"]["configErrors"]),
    )


if __name__ == "__main__":
    test_catalogo_valido()
    test_catalogo_ausente_no_es_error()
    test_ids_unicos()
    test_tipos_validos()
    test_valores_no_negativos()
    test_tope_obligatorio_en_porcentaje_con_tope()
    test_base_soportada()
    test_estructura_invalida()
    test_payload_expone_errores()
    test_impuesto_5ta_factores()
    test_impuesto_5ta_tramos()
    test_chile_y_brasil_sin_cambios()
    CalculadoraService.invalidate_cache()
    print("\nTodo OK\n")
