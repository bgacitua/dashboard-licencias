"""
Datos de la calculadora de sueldos.
Valores hardcodeados que siempre funcionan.
Migrado desde DATA/data.py del proyecto desktop.
"""

# === ESTADO (para mostrar en UI si quieres) ===
ESTADO_CONEXION = "STANDALONE"
MENSAJE_ESTADO = "Usando valores locales"

# === VALORES ECONÓMICOS ===
VALOR_UF_ACTUAL = 39597.67
SUELDO_MINIMO = 529000

# === TOPES IMPONIBLES (En UF) ===
TOPE_IMPONIBLE_AFP_SALUD = 87.8
TOPE_IMPONIBLE_CESANTIA = 131.8

# === ISAPRE ===
DEFAULT_PLAN_ISAPRE_UF = 2.822

# === TASAS AFP ===
TASAS_AFP = {
    "Capital": 0.1144,
    "Cuprum": 0.1144,
    "Habitat": 0.1127,
    "Modelo": 0.1066,
    "PlanVital": 0.1116,
    "Provida": 0.1145,
    "Uno": 0.1049
}

# === PARÁMETROS GENERALES ===
PARAMETROS = {
    "tasa_salud": 0.07,
    "tasa_cesantia": 0.006,
    "factor_gratificacion": 4.75,
    "porcentaje_gratificacion": 0.25
}

# === TRAMOS IMPUESTO ÚNICO (Segunda Categoría) ===
TRAMOS_IMPUESTO = [
    {"desde": 0, "hasta": 938_817.00, "tasa": 0.00, "rebaja": 0.0},
    {"desde": 938_817.01, "hasta": 2_086_260.00, "tasa": 0.04, "rebaja": 37_552.68},
    {"desde": 2_086_260.01, "hasta": 3_477_100.00, "tasa": 0.08, "rebaja": 121_003.08},
    {"desde": 3_477_100.01, "hasta": 4_867_940.00, "tasa": 0.135, "rebaja": 312_243.58},
    {"desde": 4_867_940.01, "hasta": 6_258_780.00, "tasa": 0.23, "rebaja": 774_697.88},
    {"desde": 6_258_780.01, "hasta": 8_345_040.00, "tasa": 0.304, "rebaja": 1_237_847.60},
    {"desde": 8_345_040.01, "hasta": 21_558_020.00, "tasa": 0.35, "rebaja": 1_621_719.44},
    {"desde": 21_558_020.01, "hasta": float('inf'), "tasa": 0.40, "rebaja": 2_699_620.44},
]


def obtener_tasa_afp(nombre: str) -> float:
    """Retorna la tasa de una AFP por nombre"""
    return TASAS_AFP.get(nombre, 0.1049)


def obtener_lista_afps() -> list:
    """Retorna lista de AFPs ordenadas"""
    return sorted(list(TASAS_AFP.keys()))