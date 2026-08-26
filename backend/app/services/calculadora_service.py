from datetime import date, datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from cachetools import TTLCache
from threading import Lock
from fastapi import HTTPException

from app.repositories.calculadora_repo import CalculadoraRepository
from app.schemas.calculadora import CountryConfigOut, ProyeccionUtilidadesPeruIn


# Umbrales de "stale" (días) — mismos que tenía el frontend antes
STALE_DAYS = {
    "uf": 2,
    "dolar": 2,
    "afp": 45,
    "tasas": 60,
    "tax_brackets": 30,
}

# Cache TTL en memoria (1h). Reemplaza el unstable_cache de Next.
_cache: TTLCache = TTLCache(maxsize=16, ttl=3600)
_cache_lock = Lock()

# Fallbacks mínimos por si la fila no existe o está toda nula.
# Si está vacío en BD, devolvemos 503 — preferimos error explícito antes que
# valores inventados que provoquen cálculos silenciosamente incorrectos.

PAISES_VALIDOS = {"chile", "peru", "brasil"}


def _is_stale(updated_at: datetime | None, threshold_days: int) -> bool:
    if updated_at is None:
        return True
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - updated_at > timedelta(days=threshold_days)


def _normalize_bonos_empresa(raw: list[dict] | None) -> list[dict]:
    """El frontend selecciona por `id`; filas antiguas traen `tipo`.

    Se expone siempre `id` (y se conserva `tipo` como espejo) para que no haya
    desajuste entre el identificador guardado y el que consume la vista.
    """
    if not raw:
        return []
    out = []
    for b in raw:
        nb = dict(b)
        if "tasa" in nb and nb["tasa"] is not None and not isinstance(nb["tasa"], list):
            nb["tasa"] = [nb["tasa"]]
        identificador = nb.get("id") or nb.get("tipo")
        if identificador is not None:
            nb["id"] = identificador
            nb["tipo"] = identificador
        out.append(nb)
    return out


# ---------------------------------------------------------------------------
# Validación de la configuración Brasil
# ---------------------------------------------------------------------------

# Tasas obligatorias (fracción o factor, todas numéricas y no negativas).
_BRASIL_TASAS_REQUERIDAS = (
    "INSS_PATRONAL", "RAT", "TERCEIROS", "FGTS", "MESES_ANIO",
    "SALARIO_MINIMO", "INSS_TRABAJADOR_TOPE", "IRRF_DESCUENTO_SIMPLIFICADO",
    "IRRF_REDUCCION_LIMITE_TOTAL", "IRRF_REDUCCION_LIMITE_PARCIAL",
    "IRRF_REDUCCION_MAXIMA", "IRRF_REDUCCION_CONSTANTE", "IRRF_REDUCCION_FACTOR",
)

# Opcionales con default estructural: FAP = 1 (sin FAP) y provisiones derivadas
# de MESES_ANIO y del tercio constitucional. Si vienen, se validan igual.
_BRASIL_TASAS_OPCIONALES = (
    "RAT_FAP", "PROVISION_13_DIVISOR", "PROVISION_VACACIONES_DIVISOR",
    "ADICIONAL_VACACIONES_DIVISOR",
)

# Divisores que además no pueden ser cero.
_BRASIL_DIVISORES = (
    "MESES_ANIO", "PROVISION_13_DIVISOR", "PROVISION_VACACIONES_DIVISOR",
    "ADICIONAL_VACACIONES_DIVISOR",
)


def _es_numero(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _validar_tramos(tramos, nombre: str, campos: tuple[str, ...]) -> list[str]:
    errores: list[str] = []
    if not isinstance(tramos, list) or not tramos:
        return [f"{nombre} debe ser una lista con al menos un tramo"]

    anterior_hasta = None
    for i, t in enumerate(tramos):
        etiqueta = f"{nombre}[{i}]"
        if not isinstance(t, dict):
            errores.append(f"{etiqueta} debe ser un objeto")
            continue

        for campo in campos:
            valor = t.get(campo)
            # 'hasta' nulo = tramo abierto, sólo válido en el último.
            if campo == "hasta" and valor is None:
                if i != len(tramos) - 1:
                    errores.append(f"{etiqueta}.hasta sólo puede ser nulo en el último tramo")
                continue
            if not _es_numero(valor):
                errores.append(f"{etiqueta}.{campo} debe ser numérico")
            elif valor < 0:
                errores.append(f"{etiqueta}.{campo} no puede ser negativo")

        desde, hasta = t.get("desde"), t.get("hasta")
        if _es_numero(desde) and _es_numero(hasta) and hasta <= desde:
            errores.append(f"{etiqueta}: 'hasta' debe ser mayor que 'desde'")
        if _es_numero(desde) and anterior_hasta is not None and desde < anterior_hasta:
            errores.append(f"{etiqueta}: los tramos deben venir ordenados y sin solaparse")
        if _es_numero(hasta):
            anterior_hasta = hasta

    return errores


def validar_config_brasil(tasas: dict[str, Any] | None) -> list[str]:
    """Errores de la configuración Brasil, en español. Lista vacía = válida."""
    errores: list[str] = []
    t = tasas or {}

    if not t:
        return ["No hay tasas cargadas para Brasil"]

    for clave in _BRASIL_TASAS_REQUERIDAS:
        if clave not in t or t[clave] is None:
            errores.append(f"Falta la clave obligatoria {clave}")
        elif not _es_numero(t[clave]):
            errores.append(f"{clave} debe ser numérico")
        elif t[clave] < 0:
            errores.append(f"{clave} no puede ser negativo")

    for clave in _BRASIL_TASAS_OPCIONALES:
        if t.get(clave) is None:
            continue
        if not _es_numero(t[clave]):
            errores.append(f"{clave} debe ser numérico")
        elif t[clave] < 0:
            errores.append(f"{clave} no puede ser negativo")

    for clave in _BRASIL_DIVISORES:
        if _es_numero(t.get(clave)) and t[clave] <= 0:
            errores.append(f"{clave} debe ser mayor que cero")

    errores += _validar_tramos(
        t.get("INSS_TRABAJADOR_TRAMOS"), "INSS_TRABAJADOR_TRAMOS", ("desde", "hasta", "tasa")
    )
    errores += _validar_tramos(
        t.get("IRRF_TRAMOS"), "IRRF_TRAMOS", ("desde", "hasta", "tasa", "rebaja")
    )

    limite_total = t.get("IRRF_REDUCCION_LIMITE_TOTAL")
    limite_parcial = t.get("IRRF_REDUCCION_LIMITE_PARCIAL")
    if _es_numero(limite_total) and _es_numero(limite_parcial) and limite_parcial < limite_total:
        errores.append(
            "IRRF_REDUCCION_LIMITE_PARCIAL debe ser mayor o igual que IRRF_REDUCCION_LIMITE_TOTAL"
        )

    if "IRRF_DEDUCCION_DEPENDIENTE" in t:
        errores.append(
            "IRRF_DEDUCCION_DEPENDIENTE ya no forma parte del modelo Brasil: elimínela de la configuración"
        )

    return errores


# ---------------------------------------------------------------------------
# Perú — validación de los aportes patronales
# ---------------------------------------------------------------------------

TIPOS_APORTE_PATRONAL = ("porcentaje", "porcentaje_con_tope", "monto_fijo")


def validar_aportes_patronales_peru(tasas: dict[str, Any] | None) -> list[str]:
    """Errores de `tasas.APORTES_PATRONALES` (Perú). Lista vacía = válida.

    El catálogo ausente NO es error: la calculadora cae de forma transitoria a
    la regla histórica de EsSalud 9% y eso se informa como warning, no aquí.
    """
    catalogo = (tasas or {}).get("APORTES_PATRONALES")
    if catalogo is None:
        return []
    if not isinstance(catalogo, list):
        return ["APORTES_PATRONALES debe ser una lista de aportes"]

    errores: list[str] = []
    vistos: set[str] = set()

    for i, a in enumerate(catalogo):
        if not isinstance(a, dict):
            errores.append(f"APORTES_PATRONALES[{i}] debe ser un objeto")
            continue

        ident = a.get("id")
        etiqueta = f"Aporte '{ident}'" if isinstance(ident, str) and ident else f"APORTES_PATRONALES[{i}]"

        if not isinstance(ident, str) or not ident:
            errores.append(f"{etiqueta}: 'id' es obligatorio")
            continue
        if ident in vistos:
            errores.append(f"{etiqueta}: identificador repetido")
            continue
        vistos.add(ident)

        tipo = a.get("tipo")
        if tipo not in TIPOS_APORTE_PATRONAL:
            errores.append(
                f"{etiqueta}: tipo desconocido '{tipo}' "
                f"(admitidos: {', '.join(TIPOS_APORTE_PATRONAL)})"
            )
            continue

        if tipo == "monto_fijo":
            monto = a.get("monto")
            if not _es_numero(monto):
                errores.append(f"{etiqueta}: 'monto' debe ser numérico")
            elif monto < 0:
                errores.append(f"{etiqueta}: 'monto' no puede ser negativo")
            continue

        tasa = a.get("tasa")
        if not _es_numero(tasa):
            errores.append(f"{etiqueta}: 'tasa' debe ser numérica")
        elif tasa < 0:
            errores.append(f"{etiqueta}: 'tasa' no puede ser negativa")

        base = a.get("base")
        if base is not None and base != "imponible":
            errores.append(f"{etiqueta}: base '{base}' no soportada (única base: 'imponible')")

        if tipo == "porcentaje_con_tope":
            tope = a.get("tope")
            if not _es_numero(tope):
                errores.append(f"{etiqueta}: 'tope' es obligatorio para porcentaje_con_tope")
            elif tope <= 0:
                errores.append(f"{etiqueta}: 'tope' debe ser mayor que cero")

    return errores


# ---------------------------------------------------------------------------
# Perú — reparto de utilidades estimado
# ---------------------------------------------------------------------------

# Factores obligatorios en calculadora.country_config.tasas (pais='peru').
# Ninguno tiene default: si falta uno devolvemos error de configuración.
FACTORES_UTILIDADES_PERU = (
    "SUELDOS_ANUALES",
    "SUELDO_MINIMO",
    "ASIGNACION_FAMILIAR_PCT",
    "CANASTA_NAVIDENA_MONTO",
    # Sólo los usa el reparto de utilidades — EN PAUSA:
    # "BASE_DIAS_PROYECCION",
    # "TOPE_UTILIDADES_MESES",
    # "PORCENTAJE_UTILIDADES_SECTOR",
)

# Métricas de nómina: cambian una vez al mes, cachear 5 min evita golpear
# rh_peru en cada tecla del usuario.
_payroll_cache: TTLCache = TTLCache(maxsize=4, ttl=300)
_payroll_lock = Lock()

_CENT = Decimal("0.01")


def _money(v: Decimal) -> float:
    return float(v.quantize(_CENT, rounding=ROUND_HALF_UP))


def validar_impuesto_5ta_peru(tasas: dict[str, Any] | None) -> list[str]:
    """Errores de los factores del impuesto de 5ta categoría (Perú).

    Sin esta validación una config a medias no falla: da un número plausible
    pero equivocado (sin UIT o sin tramos el impuesto sale 0; sin las 7 UIT de
    deducción sale más del doble). Son sueldos, así que se avisa.
    """
    t = tasas or {}
    errores: list[str] = []

    for clave, minimo in (("UIT", 0), ("SUELDOS_ANUALES", 0), ("DEDUCCION_FIJA_UIT", -1)):
        valor = t.get(clave)
        if not _es_numero(valor):
            errores.append(f"{clave} es obligatorio y debe ser numérico")
        elif valor <= minimo:
            errores.append(f"{clave} debe ser mayor que {minimo}")

    tramos = t.get("TRAMOS_IMPUESTO")
    if not isinstance(tramos, list) or not tramos:
        errores.append("TRAMOS_IMPUESTO es obligatorio y debe ser una lista no vacía")
        return errores

    # Se ordenan igual que en la calculadora: el orden en la BD no es contrato.
    ordenados = sorted(
        (x for x in tramos if isinstance(x, dict)),
        key=lambda x: x.get("desde_uf") if _es_numero(x.get("desde_uf")) else 0,
    )
    if len(ordenados) != len(tramos):
        errores.append("TRAMOS_IMPUESTO: cada tramo debe ser un objeto")

    esperado_desde = 0
    for i, tramo in enumerate(ordenados):
        etiqueta = f"TRAMOS_IMPUESTO[{i}]"
        desde, hasta, tasa = tramo.get("desde_uf"), tramo.get("hasta_uf"), tramo.get("tasa")

        if not _es_numero(tasa) or not 0 <= tasa <= 1:
            errores.append(f"{etiqueta}: 'tasa' debe ser un número entre 0 y 1")
        if not _es_numero(desde) or desde < 0:
            errores.append(f"{etiqueta}: 'desde_uf' debe ser numérico y no negativo")
            continue
        if desde != esperado_desde:
            errores.append(
                f"{etiqueta}: los tramos deben ser contiguos "
                f"(empieza en {desde} UIT y se esperaba {esperado_desde})"
            )
        ultimo = i == len(ordenados) - 1
        if hasta is None:
            if not ultimo:
                errores.append(f"{etiqueta}: sólo el último tramo puede ser abierto (hasta_uf null)")
        elif not _es_numero(hasta) or hasta <= desde:
            errores.append(f"{etiqueta}: 'hasta_uf' debe ser mayor que 'desde_uf' o null")
        else:
            esperado_desde = hasta
            if ultimo:
                errores.append(f"{etiqueta}: el último tramo debe quedar abierto (hasta_uf null)")

    return errores


def _validar_config(pais: str, tasas: dict[str, Any] | None) -> list[str]:
    if pais == "brasil":
        return validar_config_brasil(tasas)
    if pais == "peru":
        return validar_aportes_patronales_peru(tasas) + validar_impuesto_5ta_peru(tasas)
    return []


class CalculadoraService:
    def __init__(self, repo: CalculadoraRepository):
        self.repo = repo

    def get_country_config(self, pais: str) -> dict[str, Any]:
        if pais not in PAISES_VALIDOS:
            raise HTTPException(status_code=400, detail=f"País inválido: {pais}")

        with _cache_lock:
            if pais in _cache:
                return _cache[pais]

        row = self.repo.get_country_config(pais)
        if row is None:
            raise HTTPException(
                status_code=503,
                detail=f"No hay configuración cargada para {pais}",
            )

        warnings: list[str] = []

        if _is_stale(row.uf_updated_at, STALE_DAYS["uf"]):
            warnings.append("uf_value stale")
        if _is_stale(row.dolar_updated_at, STALE_DAYS["dolar"]):
            warnings.append("dolar_value stale")
        if _is_stale(row.afp_updated_at, STALE_DAYS["afp"]):
            warnings.append("afp_data stale")
        if _is_stale(row.tasas_updated_at, STALE_DAYS["tasas"]):
            warnings.append("tasas stale")
        if _is_stale(row.tax_brackets_updated_at, STALE_DAYS["tax_brackets"]):
            warnings.append("tax_brackets stale")

        if pais == "peru" and not (row.tasas or {}).get("APORTES_PATRONALES"):
            warnings.append(
                "APORTES_PATRONALES ausente: se aplica EsSalud 9% de forma transitoria"
            )

        payload = {
            "afpData": row.afp_data or {},
            "ufValue": float(row.uf_value) if row.uf_value is not None else 0.0,
            "dolarValue": float(row.dolar_value) if row.dolar_value is not None else 0.0,
            "taxBrackets": row.tax_brackets or [],
            "bonosAnualesUF": row.bonos_anuales_uf or {
                "navidad": 7, "escolaridad": 3, "fiestaPatrias": 6,
            },
            "bonosEmpresa": _normalize_bonos_empresa(row.bonos_empresa),
            "tasas": row.tasas or {},
            "_meta": {
                "pais": pais,
                "warnings": warnings,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
                # La configuración se valida antes de usarse: si hay errores la
                # vista los muestra en vez de calcular con información parcial.
                "configErrors": _validar_config(pais, row.tasas),
            },
        }

        with _cache_lock:
            _cache[pais] = payload

        return payload

    # -- Perú: reparto de utilidades ---------------------------------------

    def _peru_payroll_metrics(self) -> tuple[Decimal, Decimal]:
        """(sueldo base mensual activo, días trabajados del año en curso).

        Sin uso mientras el reparto de utilidades esté en pausa.

        Año calendario actual resuelto en backend; cache de 5 min.
        """
        anio = date.today().year
        key = f"peru:{anio}"
        with _payroll_lock:
            if key in _payroll_cache:
                return _payroll_cache[key]

        sueldos = self.repo.get_peru_sueldo_base_mensual_activo()
        dias = self.repo.get_peru_dias_trabajados(date(anio, 1, 1), date(anio + 1, 1, 1))
        metrics = (sueldos, dias)

        with _payroll_lock:
            _payroll_cache[key] = metrics
        return metrics

    def proyeccion_utilidades_peru(self, req: ProyeccionUtilidadesPeruIn) -> dict[str, Any]:
        """Asignación familiar + canasta navideña (anual).

        REPARTO DE UTILIDADES EN PAUSA: por ahora no se usa ese cálculo, así que
        `reparto_utilidades_estimado` sale en 0 y no se consulta la nómina de
        rh_peru. Todo lo relacionado quedó comentado más abajo; para reactivarlo
        basta descomentarlo, junto con BASE_DIAS_PROYECCION, TOPE_UTILIDADES_MESES
        y PORCENTAJE_UTILIDADES_SECTOR en FACTORES_UTILIDADES_PERU.
        """
        tasas = self.get_country_config("peru").get("tasas") or {}
        faltantes = [k for k in FACTORES_UTILIDADES_PERU if tasas.get(k) is None]
        if faltantes:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Configuración de utilidades Perú incompleta: faltan "
                    + ", ".join(faltantes)
                    + " en calculadora.country_config.tasas"
                ),
            )

        d = lambda v: Decimal(str(v))  # noqa: E731

        sueldos_anuales = d(tasas["SUELDOS_ANUALES"])
        sueldo_minimo = d(tasas["SUELDO_MINIMO"])
        asignacion_pct = d(tasas["ASIGNACION_FAMILIAR_PCT"])
        canasta = d(tasas["CANASTA_NAVIDENA_MONTO"])
        # base_dias_proyeccion = d(tasas["BASE_DIAS_PROYECCION"])
        # tope_meses = d(tasas["TOPE_UTILIDADES_MESES"])

        if sueldos_anuales <= 0:
            raise HTTPException(
                status_code=503,
                detail="SUELDOS_ANUALES debe ser mayor que 0 en la configuración de Perú",
            )

        asignacion_mensual = sueldo_minimo * asignacion_pct if req.tiene_asignacion_familiar else Decimal(0)
        asignacion_anual = asignacion_mensual * sueldos_anuales

        # -- Reparto de utilidades — EN PAUSA -------------------------------
        # Prorrateo del pozo (mitad por días, mitad por remuneraciones) sobre la
        # nómina activa de rh_peru, con tope de TOPE_UTILIDADES_MESES sueldos.
        #
        # sueldo_base = d(req.sueldo_base_calculado)
        # renta = d(req.renta_imponible_proyectada)
        # porcentaje = d(req.porcentaje_utilidades)
        #
        # empresa_mensual, empresa_dias = self._peru_payroll_metrics()
        # if empresa_mensual <= 0:
        #     raise HTTPException(
        #         status_code=409,
        #         detail="No hay empleados activos en rh_peru para estimar el reparto de utilidades",
        #     )
        # if empresa_dias <= 0:
        #     raise HTTPException(
        #         status_code=409,
        #         detail=f"No hay días trabajados registrados en {date.today().year} para estimar el reparto de utilidades",
        #     )
        #
        # empresa_sueldos_actual_anual = empresa_mensual * sueldos_anuales
        # remuneracion_mensual_nueva = sueldo_base + asignacion_mensual
        # nuevo_sueldo_anual = remuneracion_mensual_nueva * sueldos_anuales
        # nuevo_dias_proyectados = base_dias_proyeccion
        #
        # empresa_sueldos_total_nuevo = empresa_sueldos_actual_anual + nuevo_sueldo_anual
        # empresa_dias_total_nuevo = empresa_dias + nuevo_dias_proyectados
        # if empresa_sueldos_total_nuevo <= 0 or empresa_dias_total_nuevo <= 0:
        #     raise HTTPException(
        #         status_code=409,
        #         detail="Denominador cero: no se puede prorratear el reparto de utilidades",
        #     )
        #
        # pozo_total = renta * porcentaje
        # fondo_dias = pozo_total / 2
        # fondo_sueldos = pozo_total / 2
        # utilidad_preliminar = (
        #     nuevo_dias_proyectados * (fondo_dias / empresa_dias_total_nuevo)
        #     + nuevo_sueldo_anual * (fondo_sueldos / empresa_sueldos_total_nuevo)
        # )
        # tope_utilidad = tope_meses * sueldo_base
        # reparto = min(utilidad_preliminar, tope_utilidad)
        reparto = Decimal(0)

        return {
            # Ítems que suman al Costo Empresa Anual
            "reparto_utilidades_estimado": _money(reparto),
            "asignacion_familiar_anual": _money(asignacion_anual),
            "canasta_navidena_anual": _money(canasta),
            "total_adicional_anual": _money(reparto + asignacion_anual + canasta),
            # Internos (no se muestran en el panel de resultados)
            "asignacion_familiar_mensual": _money(asignacion_mensual),
            "anio": date.today().year,
            # -- Informativos del reparto de utilidades — EN PAUSA -----------
            # "empresa_sueldos_actual_anual": _money(empresa_sueldos_actual_anual),
            # "empresa_dias_actual": float(empresa_dias),
            # "nuevo_sueldo_anual": _money(nuevo_sueldo_anual),
            # "nuevo_dias_proyectados": float(nuevo_dias_proyectados),
            # "pozo_total": _money(pozo_total),
            # "utilidad_preliminar": _money(utilidad_preliminar),
            # "tope_utilidad": _money(tope_utilidad),
            # "tope_aplicado": tope_utilidad < utilidad_preliminar,
            # "porcentaje_utilidades_default": float(tasas["PORCENTAJE_UTILIDADES_SECTOR"]),
        }

    @staticmethod
    def invalidate_cache(pais: str | None = None) -> None:
        with _cache_lock:
            if pais is None:
                _cache.clear()
            else:
                _cache.pop(pais, None)
        with _payroll_lock:
            _payroll_cache.clear()
