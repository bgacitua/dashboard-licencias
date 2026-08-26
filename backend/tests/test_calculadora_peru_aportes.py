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

TASAS_PERU = {
    "UIT": 5500,
    "SUELDO_MINIMO": 1130,
    "TASA_AFP_OBLIGATORIA": 0.10,
    "TASA_SEGUROS_INVALIDEZ": 0.0137,
    "TASA_SALUD_PATRONAL": 0.09,
    "SUELDOS_ANUALES": 14,
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
    test_chile_y_brasil_sin_cambios()
    CalculadoraService.invalidate_cache()
    print("\nTodo OK\n")
