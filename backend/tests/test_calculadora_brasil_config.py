"""Self-check de la configuración Brasil de la calculadora.

Cubre la validación de tasas y el refresco de caché. No toca la BD: usa una
fila de country_config en memoria.

Ejecutar:
    python -m tests.test_calculadora_brasil_config
"""

from datetime import datetime, timezone

from app.services.calculadora_service import (
    CalculadoraService,
    _normalize_bonos_empresa,
    validar_config_brasil,
)
from app.repositories.calculadora_repo import CalculadoraRepository


TASAS_BRASIL = {
    "INSS_PATRONAL": 0.20,
    "RAT": 0.015,
    "RAT_FAP": 1.0,
    "TERCEIROS": 0.058,
    "FGTS": 0.08,
    "MESES_ANIO": 12,
    "PROVISION_13_DIVISOR": 12,
    "PROVISION_VACACIONES_DIVISOR": 12,
    "ADICIONAL_VACACIONES_DIVISOR": 3,
    "SALARIO_MINIMO": 1621.00,
    "INSS_TRABAJADOR_TRAMOS": [
        {"desde": 0.00, "hasta": 1621.00, "tasa": 0.075},
        {"desde": 1621.00, "hasta": 2902.84, "tasa": 0.09},
        {"desde": 2902.84, "hasta": 4354.27, "tasa": 0.12},
        {"desde": 4354.27, "hasta": 8475.55, "tasa": 0.14},
    ],
    "INSS_TRABAJADOR_TOPE": 8475.55,
    "IRRF_DESCUENTO_SIMPLIFICADO": 607.20,
    "IRRF_TRAMOS": [
        {"desde": 0.00, "hasta": 2428.80, "tasa": 0.00, "rebaja": 0.00},
        {"desde": 2428.80, "hasta": 2826.65, "tasa": 0.075, "rebaja": 182.16},
        {"desde": 2826.65, "hasta": 3751.05, "tasa": 0.15, "rebaja": 394.16},
        {"desde": 3751.05, "hasta": 4664.68, "tasa": 0.225, "rebaja": 675.49},
        {"desde": 4664.68, "hasta": None, "tasa": 0.275, "rebaja": 908.73},
    ],
    "IRRF_REDUCCION_LIMITE_TOTAL": 5000.00,
    "IRRF_REDUCCION_LIMITE_PARCIAL": 7350.00,
    "IRRF_REDUCCION_MAXIMA": 312.89,
    "IRRF_REDUCCION_CONSTANTE": 978.62,
    "IRRF_REDUCCION_FACTOR": 0.133145,
}

BONOS_BRASIL = [
    {"id": "empresa_anual", "nombre": "Bono empresa anual",
     "periodicidad": "anual", "imponible": True},
]


class _FakeRow:
    def __init__(self, tasas, bonos=None):
        self.pais = "brasil"
        self.afp_data = {}
        self.uf_value = 0
        self.dolar_value = 0
        self.tax_brackets = []
        self.bonos_anuales_uf = None
        self.bonos_empresa = bonos if bonos is not None else BONOS_BRASIL
        self.tasas = tasas
        ahora = datetime.now(timezone.utc)
        self.updated_at = ahora
        self.afp_updated_at = ahora
        self.uf_updated_at = ahora
        self.tasas_updated_at = ahora
        self.tax_brackets_updated_at = ahora
        self.dolar_updated_at = ahora


class _FakeRepo(CalculadoraRepository):
    """Cuenta cuántas veces se fue a la BD, para verificar la caché."""

    def __init__(self, tasas=None, bonos=None):
        self.lecturas = 0
        self._row = _FakeRow(tasas if tasas is not None else TASAS_BRASIL, bonos)

    def get_country_config(self, pais):
        self.lecturas += 1
        return self._row


def check(nombre, cond):
    assert cond, f"FALLO: {nombre}"
    print(f"  ok  {nombre}")


def _sin(clave):
    return {k: v for k, v in TASAS_BRASIL.items() if k != clave}


# ---------------------------------------------------------------------------
# Validación
# ---------------------------------------------------------------------------

def test_config_valida():
    print("\n[Configuración válida]")
    check("la configuración completa no reporta errores",
          validar_config_brasil(TASAS_BRASIL) == [])
    check("los errores vienen como lista", isinstance(validar_config_brasil({}), list))
    check("sin tasas reporta un error claro",
          validar_config_brasil(None) == ["No hay tasas cargadas para Brasil"])


def test_clave_obligatoria_faltante():
    print("\n[Clave obligatoria faltante]")
    obligatorias = [
        "INSS_PATRONAL", "RAT", "TERCEIROS", "FGTS", "MESES_ANIO",
        "SALARIO_MINIMO", "INSS_TRABAJADOR_TOPE", "IRRF_DESCUENTO_SIMPLIFICADO",
        "IRRF_REDUCCION_LIMITE_TOTAL", "IRRF_REDUCCION_LIMITE_PARCIAL",
        "IRRF_REDUCCION_MAXIMA", "IRRF_REDUCCION_CONSTANTE", "IRRF_REDUCCION_FACTOR",
    ]
    for clave in obligatorias:
        errores = validar_config_brasil(_sin(clave))
        check(f"falta {clave} -> error",
              any(f"Falta la clave obligatoria {clave}" == e for e in errores))

    for clave in ("INSS_TRABAJADOR_TRAMOS", "IRRF_TRAMOS"):
        errores = validar_config_brasil(_sin(clave))
        check(f"falta {clave} -> error", any(clave in e for e in errores))


def test_opcionales_con_default():
    print("\n[Opcionales con default estructural]")
    opcionales = ["RAT_FAP", "PROVISION_13_DIVISOR",
                  "PROVISION_VACACIONES_DIVISOR", "ADICIONAL_VACACIONES_DIVISOR"]

    for clave in opcionales:
        check(f"{clave} ausente no es error", validar_config_brasil(_sin(clave)) == [])

    sin_ninguna = {k: v for k, v in TASAS_BRASIL.items() if k not in opcionales}
    check("una configuración anterior a la migración sigue siendo válida",
          validar_config_brasil(sin_ninguna) == [])

    # Si vienen, se validan igual que las obligatorias.
    check("RAT_FAP negativo -> error",
          any("RAT_FAP no puede ser negativo" in e
              for e in validar_config_brasil({**TASAS_BRASIL, "RAT_FAP": -1})))
    check("RAT_FAP no numérico -> error",
          any("RAT_FAP debe ser numérico" in e
              for e in validar_config_brasil({**TASAS_BRASIL, "RAT_FAP": "1,0"})))


def test_tasa_invalida():
    print("\n[Tasa inválida]")
    check("tasa negativa",
          any("no puede ser negativo" in e
              for e in validar_config_brasil({**TASAS_BRASIL, "FGTS": -0.08})))
    check("tasa no numérica",
          any("debe ser numérico" in e
              for e in validar_config_brasil({**TASAS_BRASIL, "RAT": "1,5%"})))
    check("booleano no cuenta como número",
          any("debe ser numérico" in e
              for e in validar_config_brasil({**TASAS_BRASIL, "RAT_FAP": True})))
    check("MESES_ANIO en cero",
          any("MESES_ANIO debe ser mayor que cero" in e
              for e in validar_config_brasil({**TASAS_BRASIL, "MESES_ANIO": 0})))
    check("divisor de provisión en cero",
          any("PROVISION_13_DIVISOR debe ser mayor que cero" in e
              for e in validar_config_brasil({**TASAS_BRASIL, "PROVISION_13_DIVISOR": 0})))
    check("límite parcial menor que el total",
          any("IRRF_REDUCCION_LIMITE_PARCIAL" in e
              for e in validar_config_brasil(
                  {**TASAS_BRASIL, "IRRF_REDUCCION_LIMITE_PARCIAL": 1000.0})))
    check("tasa dentro de un tramo no numérica",
          any("tasa debe ser numérico" in e
              for e in validar_config_brasil({
                  **TASAS_BRASIL,
                  "INSS_TRABAJADOR_TRAMOS": [{"desde": 0, "hasta": 100, "tasa": "x"}],
              })))


def test_tramos_desordenados():
    print("\n[Tramos desordenados]")
    invertidos = list(reversed(TASAS_BRASIL["INSS_TRABAJADOR_TRAMOS"]))
    check("INSS invertido -> error de orden",
          any("ordenados" in e for e in validar_config_brasil(
              {**TASAS_BRASIL, "INSS_TRABAJADOR_TRAMOS": invertidos})))

    solapados = [
        {"desde": 0, "hasta": 2000, "tasa": 0.075},
        {"desde": 1000, "hasta": 3000, "tasa": 0.09},
    ]
    check("tramos solapados -> error",
          any("solapars" in e or "ordenados" in e for e in validar_config_brasil(
              {**TASAS_BRASIL, "INSS_TRABAJADOR_TRAMOS": solapados})))

    invertido_interno = [{"desde": 2000, "hasta": 1000, "tasa": 0.075}]
    check("'hasta' menor que 'desde' -> error",
          any("mayor que 'desde'" in e for e in validar_config_brasil(
              {**TASAS_BRASIL, "INSS_TRABAJADOR_TRAMOS": invertido_interno})))

    abierto_al_medio = [
        {"desde": 0, "hasta": None, "tasa": 0.0, "rebaja": 0.0},
        {"desde": 100, "hasta": 200, "tasa": 0.1, "rebaja": 0.0},
    ]
    check("tramo abierto que no es el último -> error",
          any("último tramo" in e for e in validar_config_brasil(
              {**TASAS_BRASIL, "IRRF_TRAMOS": abierto_al_medio})))

    check("lista de tramos vacía -> error",
          any("al menos un tramo" in e for e in validar_config_brasil(
              {**TASAS_BRASIL, "IRRF_TRAMOS": []})))


def test_sin_dependientes():
    print("\n[Sin dependencia de IRRF_DEDUCCION_DEPENDIENTE]")
    check("la clave no es obligatoria",
          validar_config_brasil(TASAS_BRASIL) == [])
    con_clave = {**TASAS_BRASIL, "IRRF_DEDUCCION_DEPENDIENTE": 189.59}
    errores = validar_config_brasil(con_clave)
    check("si quedó en la BD, se pide eliminarla",
          any("IRRF_DEDUCCION_DEPENDIENTE" in e and "elimín" in e for e in errores))


# ---------------------------------------------------------------------------
# Payload y caché
# ---------------------------------------------------------------------------

def test_payload_expone_errores():
    print("\n[El payload expone el diagnóstico]")
    CalculadoraService.invalidate_cache()
    ok = CalculadoraService(_FakeRepo()).get_country_config("brasil")
    check("config válida -> configErrors vacío", ok["_meta"]["configErrors"] == [])

    CalculadoraService.invalidate_cache()
    malo = CalculadoraService(_FakeRepo(_sin("FGTS"))).get_country_config("brasil")
    check("config inválida -> configErrors con el detalle",
          any("FGTS" in e for e in malo["_meta"]["configErrors"]))

    CalculadoraService.invalidate_cache()
    chile = CalculadoraService(_FakeRepo()).get_country_config("chile")
    check("Chile no pasa por la validación Brasil", chile["_meta"]["configErrors"] == [])


def test_bonos_id_tipo():
    print("\n[Bonos empresa: id / tipo sin desajuste]")
    solo_tipo = _normalize_bonos_empresa([{"tipo": "empresa_anual", "nombre": "Bono"}])
    check("una fila con sólo 'tipo' expone 'id'", solo_tipo[0]["id"] == "empresa_anual")
    check("y conserva 'tipo'", solo_tipo[0]["tipo"] == "empresa_anual")

    solo_id = _normalize_bonos_empresa([{"id": "empresa_anual", "nombre": "Bono"}])
    check("una fila con sólo 'id' expone 'tipo'", solo_id[0]["tipo"] == "empresa_anual")

    check("la tasa escalar se normaliza a lista",
          _normalize_bonos_empresa([{"id": "x", "tasa": 0.5}])[0]["tasa"] == [0.5])
    check("sin bonos devuelve lista vacía", _normalize_bonos_empresa(None) == [])

    CalculadoraService.invalidate_cache()
    cfg = CalculadoraService(_FakeRepo()).get_country_config("brasil")
    check("el bono Brasil llega con id y periodicidad anual",
          cfg["bonosEmpresa"][0]["id"] == "empresa_anual"
          and cfg["bonosEmpresa"][0]["periodicidad"] == "anual")
    check("el bono Brasil viene marcado imponible",
          cfg["bonosEmpresa"][0]["imponible"] is True)


def test_refresco_cache():
    print("\n[Refresco / invalidación de caché]")
    CalculadoraService.invalidate_cache()
    repo = _FakeRepo()
    svc = CalculadoraService(repo)

    svc.get_country_config("brasil")
    check("primera lectura va a la BD", repo.lecturas == 1)

    svc.get_country_config("brasil")
    check("la segunda sale de caché", repo.lecturas == 1)

    # Se actualizan las tasas en BD: sin refrescar, la caché sigue sirviendo lo viejo.
    repo._row.tasas = {**TASAS_BRASIL, "FGTS": 0.09}
    check("sin refrescar, la caché devuelve el valor viejo",
          svc.get_country_config("brasil")["tasas"]["FGTS"] == 0.08)

    CalculadoraService.invalidate_cache("brasil")
    refrescado = svc.get_country_config("brasil")
    check("tras invalidar, se relee de la BD", repo.lecturas == 2)
    check("y devuelve el valor nuevo", refrescado["tasas"]["FGTS"] == 0.09)

    # Invalidar un país no bota la caché de los demás.
    CalculadoraService.invalidate_cache()
    otro = _FakeRepo()
    svc2 = CalculadoraService(otro)
    svc2.get_country_config("brasil")
    svc2.get_country_config("chile")
    lecturas = otro.lecturas
    CalculadoraService.invalidate_cache("brasil")
    svc2.get_country_config("chile")
    check("invalidar Brasil no afecta la caché de Chile", otro.lecturas == lecturas)
    svc2.get_country_config("brasil")
    check("pero Brasil sí se relee", otro.lecturas == lecturas + 1)


def test_endpoint_es_admin():
    print("\n[El refresco es administrativo, no público]")
    import inspect
    from app.api.v1.endpoints import calculadora as ep

    check("existe el endpoint de refresco", hasattr(ep, "refresh_country_config"))
    fuente = inspect.getsource(ep.refresh_country_config)
    check("usa require_role(['admin'])", 'require_role(["admin"])' in fuente)
    check("la config pública sigue con require_module",
          'require_module("calculadora")' in inspect.getsource(ep.get_country_config))


if __name__ == "__main__":
    test_config_valida()
    test_clave_obligatoria_faltante()
    test_opcionales_con_default()
    test_tasa_invalida()
    test_tramos_desordenados()
    test_sin_dependientes()
    test_payload_expone_errores()
    test_bonos_id_tipo()
    test_refresco_cache()
    test_endpoint_es_admin()
    print("\nTodo OK\n")
