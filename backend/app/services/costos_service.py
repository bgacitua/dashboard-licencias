"""Lógica de negocio del módulo Costos por Área.

Implementa la matriz de casos borde §4.6 de la spec:
- Mes en curso sin liquidar  → fallback al último cerrado + banner.
- Mes futuro                  → fallback al último cerrado + banner.
- Filtro = 1 mes pasado       → ese mes + anual = últimos 12m desde ese mes.
- Persona/área sin colaboradores activos → respuesta vacía con banner.
"""
from datetime import date
from threading import Lock
from typing import Any
from cachetools import TTLCache

from app.repositories.costos_repo import CostosRepository, _restar_meses
from app.schemas.costos import FilterRequest


# ---------------------------------------------------------------------------
# Caches (catálogos cambian poco)
# ---------------------------------------------------------------------------
_cache_dimensiones: TTLCache = TTLCache(maxsize=128, ttl=3600)
_cache_income_types: TTLCache = TTLCache(maxsize=8, ttl=3600)
_cache_conceptos: TTLCache = TTLCache(maxsize=8, ttl=3600)
_cache_lock = Lock()


def _formatear_mes(d: date | None) -> str | None:
    if d is None:
        return None
    meses = ["ene", "feb", "mar", "abr", "may", "jun",
             "jul", "ago", "sep", "oct", "nov", "dic"]
    return f"{meses[d.month - 1]}-{str(d.year)[-2:]}"


class CostosService:
    def __init__(self, repo: CostosRepository):
        self.repo = repo

    # ------------------------------------------------------------------ catálogos
    def get_dimensiones(self, empresas=None, areas=None, subareas=None) -> dict:
        key = (self.repo.pais, "dim", tuple(empresas or []), tuple(areas or []), tuple(subareas or []))
        with _cache_lock:
            if key in _cache_dimensiones:
                return _cache_dimensiones[key]
        data = self.repo.get_dimensiones(empresas, areas, subareas)
        with _cache_lock:
            _cache_dimensiones[key] = data
        return data

    def get_income_types(self) -> list[str]:
        key = self.repo.pais
        with _cache_lock:
            if key in _cache_income_types:
                return _cache_income_types[key]
        data = self.repo.get_income_types()
        with _cache_lock:
            _cache_income_types[key] = data
        return data

    def get_conceptos(self) -> list[str]:
        key = self.repo.pais
        with _cache_lock:
            if key in _cache_conceptos:
                return _cache_conceptos[key]
        data = self.repo.get_conceptos()
        with _cache_lock:
            _cache_conceptos[key] = data
        return data

    def buscar_personas(self, q: str, limit: int = 20):
        if len(q.strip()) < 2:
            return []
        return self.repo.buscar_personas(q.strip(), limit)

    def buscar_jefes(
        self,
        q: str,
        limit: int = 20,
        *,
        empresas=None,
        areas=None,
        subareas=None,
    ):
        if len(q.strip()) < 2:
            return []
        return self.repo.buscar_jefes(
            q.strip(),
            limit,
            empresas=empresas or None,
            areas=areas or None,
            subareas=subareas or None,
        )

    # ------------------------------------------------------------------ KPIs
    def get_kpis(self, f: FilterRequest) -> dict[str, Any]:
        # 1. Detectar último pay_period dentro del rango filtrado.
        ultimo = self.repo.get_max_pay_period(f, dentro_del_periodo=True)
        banner: str | None = None
        hoy = date.today()

        # 2. Fallbacks por casos borde.
        if ultimo is None:
            # Sin datos en el rango → caer al último global con esos filtros.
            ultimo_global = self.repo.get_max_pay_period(f, dentro_del_periodo=False)
            if ultimo_global is None:
                return _kpi_vacio("Sin colaboradores con datos en este filtro.")
            ultimo = ultimo_global
            primer_dia_mes_actual = date(hoy.year, hoy.month, 1)
            if f.fecha_inicio > primer_dia_mes_actual:
                banner = f"Período futuro sin datos. Mostrando último cerrado ({_formatear_mes(ultimo)})."
            elif f.fecha_inicio == primer_dia_mes_actual:
                banner = f"Mes actual aún no cerrado. Mostrando {_formatear_mes(ultimo)} (último cerrado)."
            else:
                banner = f"Sin datos en el rango. Mostrando {_formatear_mes(ultimo)} (último cerrado)."

        # 3. Costo total del período. Si el rango filtrado no tenía datos, se
        #    calcula sobre el mes al que cayó el fallback: mostrar 0 junto a un
        #    banner que anuncia otro mes deja la cifra principal mintiendo.
        f_periodo = f if banner is None else f.model_copy(
            update={"fecha_inicio": ultimo, "fecha_fin": ultimo}
        )
        costo_total_periodo = self.repo.costo_total(f_periodo)

        # 4. Costo del último mes con desglose por income_type.
        costo_mes, desglose_mes = self.repo.costo_mes_con_desglose(f, ultimo)

        # 5. Costo anual = últimos 12 meses cerrados desde el último mes.
        anual_inicio = _restar_meses(ultimo, 11)
        costo_anual, desglose_anual = self.repo.costo_rango_con_desglose(
            f, anual_inicio, ultimo
        )

        # 6. Headcount al cierre + delta MoM.
        hc = self.repo.headcount_mes(f, ultimo)
        mes_anterior = _restar_meses(ultimo, 1)
        hc_prev = self.repo.headcount_mes(f, mes_anterior)
        hc_delta = hc - hc_prev

        # 7. MoM y YoY sobre costo del último mes.
        costo_mom, _ = self.repo.costo_mes_con_desglose(f, mes_anterior)
        mom_pct = _variacion_pct(costo_mes, costo_mom)

        mes_yoy = _restar_meses(ultimo, 12)
        costo_yoy, _ = self.repo.costo_mes_con_desglose(f, mes_yoy)
        yoy_pct = _variacion_pct(costo_mes, costo_yoy)

        # 8. Costo promedio por persona en el último mes.
        costo_prom = (costo_mes / hc) if hc > 0 else 0.0

        # 9. Sin colaboradores activos → banner especial.
        if hc == 0 and costo_mes == 0 and not banner:
            banner = "Sin colaboradores activos en este filtro."

        return {
            "costo_total_periodo": costo_total_periodo,
            "costo_mensual": {
                "valor_real": costo_mes,
                "valor_teorico": None,
                "es_proyeccion": False,
                "desglose_concepto": desglose_mes,
                "etiqueta": _formatear_mes(ultimo),
            },
            "costo_anual": {
                "valor_real": costo_anual,
                "valor_teorico": None,
                "es_proyeccion": False,
                "meses_reales": 12,
                "desglose_concepto": desglose_anual,
                "etiqueta": f"{_formatear_mes(anual_inicio)} a {_formatear_mes(ultimo)}",
            },
            "headcount_cierre": hc,
            "headcount_delta_mom": hc_delta,
            "costo_promedio_persona": costo_prom,
            "mom": {
                "valor_pct": mom_pct,
                "mes_referencia": _formatear_mes(ultimo),
                "mes_comparacion": _formatear_mes(mes_anterior),
            },
            "yoy": {
                "valor_pct": yoy_pct,
                "mes_referencia": _formatear_mes(ultimo),
                "mes_comparacion": _formatear_mes(mes_yoy),
            },
            "banner": banner,
            "ultimo_mes_cerrado": ultimo,
        }

    # ------------------------------------------------------------------ tendencia
    def get_tendencia(self, f: FilterRequest) -> dict:
        return {"serie": self.repo.serie_mensual(f)}

    def get_historico_contexto(self, f: FilterRequest) -> dict:
        """Serie de los últimos 12 meses cerrados, ignorando el filtro de mes.
        Usado cuando el filtro de período es de 1 mes único."""
        ultimo = self.repo.get_max_pay_period(f, dentro_del_periodo=False)
        if ultimo is None:
            return {"serie": []}
        serie = self.repo.serie_ultimos_12m(f, ultimo)
        return {"serie": serie}

    # ------------------------------------------------------------------ comparación
    def comparar(
        self,
        fecha_inicio,
        fecha_fin,
        slots: list,
        income_types=None,
        conceptos=None,
    ) -> dict:
        """Para cada slot construye un FilterRequest equivalente y reutiliza
        la lógica de KPIs/tendencia. Devuelve un array con los resultados
        en el orden de los slots recibidos."""
        from app.schemas.costos import FilterRequest

        results = []
        for s in slots:
            # Slot.valor → FilterRequest extra
            extra = {
                "pais": self.repo.pais,
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin,
                "income_types": income_types,
                "conceptos": conceptos,
            }
            label = s.label
            v = s.valor or {}
            if s.tipo == "area":
                empresa = v.get("empresa")
                area = v.get("area")
                extra["empresas"] = [empresa] if empresa else None
                extra["areas"] = [area] if area else None
                if not label:
                    label = f"{area or '?'} ({empresa or '?'})"
            elif s.tipo == "jefatura":
                rut = v.get("rut")
                extra["jefatura_rut"] = rut
                if not label:
                    label = v.get("full_name") or rut or "?"
            elif s.tipo == "cargo":
                name_role = v.get("name_role")
                extra["cargo"] = name_role
                if not label:
                    label = name_role or "?"
            elif s.tipo == "persona":
                rut = v.get("rut")
                extra["persona_rut"] = rut
                if not label:
                    label = v.get("full_name") or rut or "?"

            f = FilterRequest(**extra)
            kpis = self.get_kpis(f)
            serie = self.repo.serie_mensual(f)

            results.append({
                "slot_id": s.id,
                "tipo": s.tipo,
                "label": label or "?",
                "kpis": kpis,
                "serie": serie,
            })

        return {"slots": results}

    # ------------------------------------------------------------------ Fase 3
    def _rango_efectivo(self, f: FilterRequest) -> FilterRequest:
        """Si el rango filtrado no tiene datos, cae al último mes cerrado.

        Es el mismo fallback que anuncia el banner de KPIs. Sin esto, el mes en
        curso deja treemap y top vacíos mientras las tarjetas muestran el mes
        anterior — en Perú, que sólo publica meses cerrados, pasaría siempre.
        """
        if self.repo.get_max_pay_period(f, dentro_del_periodo=True):
            return f
        ultimo = self.repo.get_max_pay_period(f, dentro_del_periodo=False)
        if ultimo is None:
            return f
        return f.model_copy(update={"fecha_inicio": ultimo, "fecha_fin": ultimo})

    def get_jerarquia(self, f: FilterRequest) -> dict:
        return {"nodos": self.repo.jerarquia_treemap(self._rango_efectivo(f))}

    def get_top_personas(self, f: FilterRequest, limit: int = 10) -> dict:
        rows = self.repo.top_personas(self._rango_efectivo(f), limit)
        items = [
            {
                "rank": i + 1,
                "rut": r["rut"],
                "full_name": r["full_name"],
                "cargo": r["cargo"],
                "jefatura_nombre": r["jefatura_nombre"],
                "jefatura_rut": r["jefatura_rut"],
                "costo": r["costo"],
                "concepto_principal": r["concepto_principal"],
            }
            for i, r in enumerate(rows)
        ]
        return {"items": items}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _variacion_pct(actual: float, base: float) -> float | None:
    if base is None or base == 0:
        return None
    return round((actual - base) / base * 100, 2)


def _kpi_vacio(banner: str) -> dict:
    return {
        "costo_total_periodo": 0.0,
        "costo_mensual": {
            "valor_real": 0.0,
            "valor_teorico": None,
            "es_proyeccion": False,
            "desglose_concepto": [],
            "etiqueta": None,
        },
        "costo_anual": {
            "valor_real": 0.0,
            "valor_teorico": None,
            "es_proyeccion": False,
            "meses_reales": 0,
            "desglose_concepto": [],
            "etiqueta": None,
        },
        "headcount_cierre": 0,
        "headcount_delta_mom": 0,
        "costo_promedio_persona": 0.0,
        "mom": {"valor_pct": None, "mes_referencia": None, "mes_comparacion": None},
        "yoy": {"valor_pct": None, "mes_referencia": None, "mes_comparacion": None},
        "banner": banner,
        "ultimo_mes_cerrado": None,
    }
