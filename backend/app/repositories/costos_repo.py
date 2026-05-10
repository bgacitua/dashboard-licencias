"""Repositorio del módulo Costos. Queries SQL crudas sobre costos.* y rh.*."""
from datetime import date
from typing import Any, Optional
from sqlalchemy import text, bindparam
from sqlalchemy.orm import Session

from app.schemas.costos import FilterRequest


# ---------------------------------------------------------------------------
# Helper: traduce FilterRequest a fragmento WHERE parametrizado.
# ---------------------------------------------------------------------------
def build_where(
    f: FilterRequest,
    *,
    incluir_periodo: bool = True,
    alias: str = "",
) -> tuple[str, dict[str, Any], list[Any]]:
    """
    Devuelve (sql_where, params, expanding_binds).

    - `sql_where`: fragmento que arranca con 'AND ...' (sin el WHERE inicial).
    - `params`: dict para bind escalares.
    - `expanding_binds`: lista de bindparam(..., expanding=True) que el caller
      debe pasar a `text(...).bindparams(*expanding_binds)`.
    """
    p = f"{alias}." if alias else ""
    parts: list[str] = []
    params: dict[str, Any] = {}
    expanding: list[Any] = []

    if incluir_periodo:
        parts.append(f"{p}pay_period BETWEEN :fecha_inicio AND :fecha_fin")
        params["fecha_inicio"] = f.fecha_inicio
        params["fecha_fin"] = f.fecha_fin

    if f.empresas:
        parts.append(f"{p}empresa IN :empresas")
        params["empresas"] = f.empresas
        expanding.append(bindparam("empresas", expanding=True))
    if f.areas:
        parts.append(f"{p}area IN :areas")
        params["areas"] = f.areas
        expanding.append(bindparam("areas", expanding=True))
    if f.subareas:
        parts.append(f"{p}subarea IN :subareas")
        params["subareas"] = f.subareas
        expanding.append(bindparam("subareas", expanding=True))
    if f.centros_costo:
        parts.append(f"{p}centro_costo_efectivo IN :centros_costo")
        params["centros_costo"] = f.centros_costo
        expanding.append(bindparam("centros_costo", expanding=True))
    if f.cargo:
        parts.append(f"{p}cargo = :cargo")
        params["cargo"] = f.cargo
    if f.persona_rut:
        parts.append(f"{p}rut = :persona_rut")
        params["persona_rut"] = f.persona_rut
    if f.income_types:
        parts.append(f"{p}income_type IN :income_types")
        params["income_types"] = f.income_types
        expanding.append(bindparam("income_types", expanding=True))
    if f.conceptos:
        parts.append(f"{p}concepto IN :conceptos")
        params["conceptos"] = f.conceptos
        expanding.append(bindparam("conceptos", expanding=True))
    if f.jefatura_rut:
        parts.append(
            f"{p}rut IN (SELECT descendiente_rut FROM costos.mv_jerarquia_jefatura "
            f"WHERE jefe_rut = :jefatura_rut)"
        )
        params["jefatura_rut"] = f.jefatura_rut

    where_sql = (" AND " + " AND ".join(parts)) if parts else ""
    return where_sql, params, expanding


class CostosRepository:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------ catálogos
    def get_dimensiones(
        self,
        empresas: Optional[list[str]] = None,
        areas: Optional[list[str]] = None,
        subareas: Optional[list[str]] = None,
    ) -> dict[str, list[str]]:
        """Devuelve catálogos en cascada. Cada filtro reduce el universo del siguiente."""
        binds: list[Any] = []
        params: dict[str, Any] = {}
        conds = ["1 = 1"]
        if empresas:
            conds.append("empresa IN :empresas")
            params["empresas"] = empresas
            binds.append(bindparam("empresas", expanding=True))
        if areas:
            conds.append("area IN :areas")
            params["areas"] = areas
            binds.append(bindparam("areas", expanding=True))
        if subareas:
            conds.append("subarea IN :subareas")
            params["subareas"] = subareas
            binds.append(bindparam("subareas", expanding=True))

        where = " AND ".join(conds)
        sql = text(f"""
            SELECT empresa, area, subarea, centro_costo, cargo
            FROM costos.v_dimensiones
            WHERE {where}
        """)
        if binds:
            sql = sql.bindparams(*binds)

        rows = self.db.execute(sql, params).mappings().all()

        def uniq(col: str) -> list[str]:
            return sorted({r[col] for r in rows if r[col]})

        return {
            "empresas": uniq("empresa"),
            "areas": uniq("area"),
            "subareas": uniq("subarea"),
            "centros_costo": uniq("centro_costo"),
            "cargos": uniq("cargo"),
        }

    def get_income_types(self) -> list[str]:
        sql = text("""
            SELECT DISTINCT income_type
            FROM costos.mv_costos_colaboradores
            WHERE income_type IS NOT NULL
            ORDER BY income_type
        """)
        return [r[0] for r in self.db.execute(sql).all()]

    def get_conceptos(self) -> list[str]:
        sql = text("""
            SELECT DISTINCT concepto
            FROM costos.mv_costos_colaboradores
            WHERE concepto IS NOT NULL
            ORDER BY concepto
        """)
        return [r[0] for r in self.db.execute(sql).all()]

    def buscar_personas(self, q: str, limit: int = 20) -> list[dict]:
        sql = text("""
            SELECT e.rut, e.full_name, e.name_role AS cargo,
                   a.first_level_name AS empresa, a.name AS area
            FROM rh.employees e
            LEFT JOIN rh.areas a ON a.id = e.area_id
            WHERE e.status = 'activo'
              AND e.full_name ILIKE :q
            ORDER BY e.full_name
            LIMIT :limit
        """)
        rows = self.db.execute(sql, {"q": f"%{q}%", "limit": limit}).mappings().all()
        return [dict(r) for r in rows]

    def buscar_jefes(
        self,
        q: str,
        limit: int = 20,
        *,
        empresas: Optional[list[str]] = None,
        areas: Optional[list[str]] = None,
        subareas: Optional[list[str]] = None,
    ) -> list[dict]:
        """Autocomplete de jefes. Filtra por empresa/area/subarea cuando se piden,
        para que no aparezcan jefes de scopes irrelevantes."""
        params: dict[str, Any] = {"q": f"%{q}%", "limit": limit}
        binds: list[Any] = []
        extra: list[str] = []

        if empresas:
            extra.append("a.first_level_name IN :empresas")
            params["empresas"] = empresas
            binds.append(bindparam("empresas", expanding=True))
        if subareas:
            extra.append("a.second_level_name IN :subareas")
            params["subareas"] = subareas
            binds.append(bindparam("subareas", expanding=True))
        if areas:
            extra.append("a.name IN :areas")
            params["areas"] = areas
            binds.append(bindparam("areas", expanding=True))

        extra_sql = (" AND " + " AND ".join(extra)) if extra else ""

        sql = text(f"""
            SELECT e.rut,
                   e.full_name,
                   e.name_role,
                   a.first_level_name AS empresa,
                   a.name             AS area,
                   a.second_level_name AS subarea,
                   (
                     SELECT COUNT(*)
                     FROM rh.employees sub
                     WHERE sub.rut_boss = e.rut AND sub.status = 'activo'
                   ) AS subordinados_directos
            FROM rh.employees e
            LEFT JOIN rh.areas a ON a.id = e.area_id
            WHERE e.status = 'activo'
              AND e.full_name ILIKE :q
              AND EXISTS (
                SELECT 1 FROM rh.employees sub
                WHERE sub.rut_boss = e.rut AND sub.status = 'activo'
              )
              {extra_sql}
            ORDER BY e.full_name
            LIMIT :limit
        """)
        if binds:
            sql = sql.bindparams(*binds)
        rows = self.db.execute(sql, params).mappings().all()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------ KPIs
    def get_max_pay_period(self, f: FilterRequest, *, dentro_del_periodo: bool) -> Optional[date]:
        """Último pay_period con datos.

        Si dentro_del_periodo=True: respeta fecha_inicio/fin.
        Si False: ignora el rango (fallback global) — útil cuando el filtro
        de mes está vacío (mes en curso/futuro).
        """
        f_eval = f if dentro_del_periodo else f.model_copy(update={
            "fecha_inicio": date(2019, 1, 1),
            "fecha_fin": date(2099, 12, 31),
        })
        where, params, binds = build_where(f_eval, incluir_periodo=True)
        sql = text(f"""
            SELECT MAX(pay_period) AS ultimo
            FROM costos.mv_costos_colaboradores
            WHERE 1 = 1 {where}
        """)
        if binds:
            sql = sql.bindparams(*binds)
        row = self.db.execute(sql, params).first()
        return row[0] if row and row[0] else None

    def costo_total(self, f: FilterRequest) -> float:
        where, params, binds = build_where(f)
        sql = text(f"""
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM costos.mv_costos_colaboradores
            WHERE 1 = 1 {where}
        """)
        if binds:
            sql = sql.bindparams(*binds)
        return float(self.db.execute(sql, params).scalar() or 0)

    def costo_mes_con_desglose(
        self, f: FilterRequest, mes: date
    ) -> tuple[float, list[dict]]:
        """Costo total + desglose por concepto (Sueldo Base, Hora Extra, …) para un pay_period."""
        f_mes = f.model_copy(update={"fecha_inicio": mes, "fecha_fin": mes})
        where, params, binds = build_where(f_mes)
        sql = text(f"""
            SELECT concepto, COALESCE(SUM(amount), 0) AS monto
            FROM costos.mv_costos_colaboradores
            WHERE 1 = 1 {where}
            GROUP BY concepto
            ORDER BY monto DESC
        """)
        if binds:
            sql = sql.bindparams(*binds)
        rows = self.db.execute(sql, params).mappings().all()
        desglose = [{"concepto": r["concepto"], "monto": float(r["monto"])} for r in rows]
        total = sum(d["monto"] for d in desglose)
        return total, desglose

    def costo_rango_con_desglose(
        self, f: FilterRequest, mes_inicio: date, mes_fin: date
    ) -> tuple[float, list[dict]]:
        f_rango = f.model_copy(update={"fecha_inicio": mes_inicio, "fecha_fin": mes_fin})
        where, params, binds = build_where(f_rango)
        sql = text(f"""
            SELECT concepto, COALESCE(SUM(amount), 0) AS monto
            FROM costos.mv_costos_colaboradores
            WHERE 1 = 1 {where}
            GROUP BY concepto
            ORDER BY monto DESC
        """)
        if binds:
            sql = sql.bindparams(*binds)
        rows = self.db.execute(sql, params).mappings().all()
        desglose = [{"concepto": r["concepto"], "monto": float(r["monto"])} for r in rows]
        total = sum(d["monto"] for d in desglose)
        return total, desglose

    def headcount_mes(self, f: FilterRequest, mes: date) -> int:
        f_mes = f.model_copy(update={"fecha_inicio": mes, "fecha_fin": mes})
        where, params, binds = build_where(f_mes)
        sql = text(f"""
            SELECT COUNT(DISTINCT rut) AS hc
            FROM costos.mv_costos_colaboradores
            WHERE 1 = 1 {where}
        """)
        if binds:
            sql = sql.bindparams(*binds)
        return int(self.db.execute(sql, params).scalar() or 0)

    # ------------------------------------------------------------------ tendencia
    def serie_mensual(self, f: FilterRequest) -> list[dict]:
        where, params, binds = build_where(f)
        sql = text(f"""
            SELECT pay_period,
                   COALESCE(SUM(amount), 0) AS costo,
                   COUNT(DISTINCT rut)      AS headcount
            FROM costos.mv_costos_colaboradores
            WHERE 1 = 1 {where}
            GROUP BY pay_period
            ORDER BY pay_period
        """)
        if binds:
            sql = sql.bindparams(*binds)
        rows = self.db.execute(sql, params).mappings().all()
        return [
            {"pay_period": r["pay_period"], "costo": float(r["costo"]), "headcount": int(r["headcount"])}
            for r in rows
        ]

    def serie_ultimos_12m(self, f: FilterRequest, mes_referencia: date) -> list[dict]:
        """Serie de últimos 12 meses cerrados desde mes_referencia hacia atrás.
        Ignora el filtro de período del FilterRequest."""
        # mes_referencia es el último mes a incluir (inclusive).
        # 12 meses atrás (inclusive).
        f12 = f.model_copy(update={
            "fecha_inicio": _restar_meses(mes_referencia, 11),
            "fecha_fin": mes_referencia,
        })
        return self.serie_mensual(f12)

    # ------------------------------------------------------------------ jerarquía y top
    def jerarquia_treemap(self, f: FilterRequest) -> list[dict]:
        where, params, binds = build_where(f)
        sql = text(f"""
            SELECT empresa, area, centro_costo_efectivo AS centro_costo,
                   COALESCE(SUM(amount), 0)             AS costo,
                   COUNT(DISTINCT rut)                  AS headcount
            FROM costos.mv_costos_colaboradores
            WHERE 1 = 1 {where}
            GROUP BY empresa, area, centro_costo_efectivo
            ORDER BY costo DESC
        """)
        if binds:
            sql = sql.bindparams(*binds)
        rows = self.db.execute(sql, params).mappings().all()
        return [
            {
                "empresa": r["empresa"],
                "area": r["area"],
                "centro_costo": r["centro_costo"],
                "costo": float(r["costo"]),
                "headcount": int(r["headcount"]),
            }
            for r in rows
        ]

    def top_personas(self, f: FilterRequest, limit: int = 10) -> list[dict]:
        where, params, binds = build_where(f)
        params["limit"] = limit
        sql = text(f"""
            SELECT rut,
                   MAX(full_name)                AS full_name,
                   MAX(cargo)                    AS cargo,
                   MAX(jefatura_nombre)          AS jefatura_nombre,
                   MAX(rut_boss)                 AS jefatura_rut,
                   COALESCE(SUM(amount), 0)      AS costo,
                   (SELECT concepto
                      FROM costos.mv_costos_colaboradores m2
                      WHERE m2.rut = m.rut
                        AND m2.pay_period BETWEEN :fecha_inicio AND :fecha_fin
                      GROUP BY concepto
                      ORDER BY SUM(amount) DESC
                      LIMIT 1)                   AS concepto_principal
            FROM costos.mv_costos_colaboradores m
            WHERE 1 = 1 {where}
            GROUP BY rut
            ORDER BY costo DESC
            LIMIT :limit
        """)
        if binds:
            sql = sql.bindparams(*binds)
        rows = self.db.execute(sql, params).mappings().all()
        return [
            {
                "rut": r["rut"],
                "full_name": r["full_name"],
                "cargo": r["cargo"],
                "jefatura_nombre": r["jefatura_nombre"],
                "jefatura_rut": r["jefatura_rut"],
                "costo": float(r["costo"]),
                "concepto_principal": r["concepto_principal"],
            }
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Helper de fechas
# ---------------------------------------------------------------------------
def _restar_meses(d: date, meses: int) -> date:
    y = d.year
    m = d.month - meses
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)
