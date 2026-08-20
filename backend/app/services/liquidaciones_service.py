"""
Alerta de descuadre de liquidaciones en período de cierre.

El día del cierre se congela un snapshot de los montos del mes (el target).
Desde ahí y hasta fin de mes esos montos no deben moverse, así que cada barrido
posterior compara contra el target y cualquier diferencia se reporta.

No hay umbral: el delta esperado es exactamente 0.

Se vigilan cuatro campos por liquidación: el líquido, el bruto y las dos bases
de cotización. Un bruto que se mueve dejando el líquido igual también es un
descuadre, y una base de cotización mal cuadrada se paga en la previred.

Las fechas de cierre salen de app.calendariocierres, la misma tabla que usa
ContractAlertsService, para que ambos mecanismos no se desincronicen.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, NamedTuple, Optional, Tuple

import httpx
from sqlalchemy import text

from app.core.config import settings
from app.core.logging_config import logger


class LiquidacionesError(Exception):
    pass


# Campos de la respuesta de BUK que se congelan y se comparan.
CAMPOS_VIGILADOS = ("income_net", "income_gross", "income_afp", "income_ips")

# Etiquetas para el aviso de Telegram.
ETIQUETAS = {
    "income_net": "Líquido",
    "income_gross": "Bruto",
    "income_afp": "Base AFP",
    "income_ips": "Base IPS",
    "alta_post_cierre": "Alta posterior al cierre",
    "baja_post_cierre": "Baja posterior al cierre",
}


class Descuadre(NamedTuple):
    employee_id: int
    rut: Optional[str]
    campo: str
    valor_target: Optional[Decimal]
    valor_actual: Optional[Decimal]


def _periodo_actual(hoy: date) -> str:
    return f"{hoy.year}-{hoy.month:02d}"


def _a_decimal(valor: Any) -> Optional[Decimal]:
    if valor is None or valor == "":
        return None
    try:
        return Decimal(str(valor)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def _fecha_param(periodo: str) -> str:
    """'2026-08' -> '01-08-2026'. BUK espera DD-MM-YYYY con el día siempre en 01."""
    anio, mes = periodo.split("-")
    return f"01-{int(mes):02d}-{anio}"


def diff_liquidaciones(
    target: Dict[int, Dict[str, Any]],
    actual: Dict[int, Dict[str, Any]],
) -> List[Descuadre]:
    """
    Compara el snapshot congelado contra la lectura actual.

    Emite un Descuadre por cada campo vigilado que cambió, más uno por empleado
    que aparece o desaparece: el diff es de conjuntos además de montos.

    En las bajas el rut sale del snapshot, que es el único lugar donde queda
    registrado una vez que el empleado ya no viene en la lectura.
    """
    difs: List[Descuadre] = []

    for emp_id in sorted(set(target) | set(actual)):
        t = target.get(emp_id)
        a = actual.get(emp_id)

        if t is None:
            difs.append(Descuadre(
                emp_id, a.get("rut"), "alta_post_cierre", None, a.get("income_net")
            ))
            continue

        if a is None:
            difs.append(Descuadre(
                emp_id, t.get("rut"), "baja_post_cierre", t.get("income_net"), None
            ))
            continue

        for campo in CAMPOS_VIGILADOS:
            vt, va = t.get(campo), a.get(campo)
            if vt != va:
                difs.append(Descuadre(emp_id, a.get("rut") or t.get("rut"), campo, vt, va))

    return difs


def agrupar_por_rut(descuadres: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Junta los descuadres de un mismo trabajador en una sola entrada, para que la
    alerta no repita el rut una vez por campo movido.
    """
    grupos: Dict[int, Dict[str, Any]] = {}
    for d in descuadres:
        emp_id = d["employee_id"]
        if emp_id not in grupos:
            grupos[emp_id] = {
                "employee_id": emp_id,
                "rut": d.get("rut"),
                "campos": [],
            }
        if grupos[emp_id]["rut"] is None:
            grupos[emp_id]["rut"] = d.get("rut")
        grupos[emp_id]["campos"].append({
            "campo": d["campo"],
            "etiqueta": ETIQUETAS.get(d["campo"], d["campo"]),
            "target": d["valor_target"],
            "actual": d["valor_actual"],
        })
    return sorted(grupos.values(), key=lambda g: (g["rut"] or "", g["employee_id"]))


class LiquidacionesService:
    def __init__(self, db):
        self.db = db

    # ---------------------------------------------------------------
    # Calendario de cierres (compartido con las alertas de contratos)
    # ---------------------------------------------------------------

    def get_fecha_cierre(self, anio: int, mes: int) -> Optional[date]:
        row = self.db.execute(
            text("SELECT fecha_cierre FROM app.calendariocierres WHERE anio = :a AND mes = :m"),
            {"a": anio, "m": mes},
        ).fetchone()
        if not row:
            return None
        fecha = row[0]
        if isinstance(fecha, str):
            fecha = datetime.strptime(fecha, "%Y-%m-%d").date()
        return fecha

    def ventana_post_cierre(self, hoy: Optional[date] = None) -> Tuple[bool, str]:
        """
        ¿Estamos en la ventana de vigilancia? Va desde el día del cierre hasta
        fin de mes. Es la imagen espejo del "modo cierre" de ContractAlertsService
        (que mira los 7 días PREVIOS), sobre el mismo calendario.
        """
        hoy = hoy or date.today()
        fecha_cierre = self.get_fecha_cierre(hoy.year, hoy.month)
        if not fecha_cierre:
            return False, f"sin cierre configurado para {hoy.month}/{hoy.year}"
        if hoy < fecha_cierre:
            return False, f"faltan {(fecha_cierre - hoy).days} días para el cierre ({fecha_cierre})"
        ultimo_dia = calendar.monthrange(hoy.year, hoy.month)[1]
        return True, f"post-cierre ({fecha_cierre} -> {hoy.year}-{hoy.month:02d}-{ultimo_dia})"

    # ---------------------------------------------------------------
    # BUK
    # ---------------------------------------------------------------

    async def fetch_liquidaciones(self, periodo: str) -> Dict[int, Dict[str, Any]]:
        """
        Trae todas las liquidaciones del período, siguiendo pagination.next.
        Devuelve {employee_id: {"rut": str|None, <campo vigilado>: Decimal, ...}}.

        GET {base}/payroll_detail/month?date=01-MM-YYYY&page_size=100
        """
        url = f"{settings.BUK_API_BASE_URL}{settings.LIQUIDACIONES_ENDPOINT_PATH}"
        params: Optional[Dict[str, Any]] = {
            "date": _fecha_param(periodo),
            "page_size": 100,
        }
        headers = {"auth_token": settings.BUK_API_KEY, "Content-Type": "application/json"}

        resultado: Dict[int, Dict[str, Any]] = {}
        paginas = 0
        truncado = False

        async with httpx.AsyncClient(timeout=60.0) as client:
            while url:
                if paginas >= settings.LIQUIDACIONES_MAX_PAGINAS:
                    truncado = True
                    break
                try:
                    resp = await client.get(url, headers=headers, params=params)
                    resp.raise_for_status()
                except httpx.HTTPStatusError as e:
                    raise LiquidacionesError(
                        f"BUK respondió {e.response.status_code} en {url}: {e.response.text[:300]}"
                    )
                except httpx.RequestError as e:
                    raise LiquidacionesError(f"Error de conexión con BUK: {e}")

                data = resp.json()
                paginas += 1

                for item in data.get("data", []):
                    emp_id = item.get("employee_id")
                    if emp_id is None:
                        continue
                    fila: Dict[str, Any] = {"rut": item.get("rut")}
                    for campo in CAMPOS_VIGILADOS:
                        fila[campo] = _a_decimal(item.get(campo))
                    resultado[int(emp_id)] = fila

                # next ya trae date/page/page_size embebidos: se sigue tal cual y
                # se sueltan los params para no duplicarlos en la query.
                url = (data.get("pagination") or {}).get("next")
                params = None

        if truncado:
            # Truncar la lectura inventa "bajas" que no existen, así que se corta el
            # barrido antes de comparar en vez de emitir alertas falsas.
            raise LiquidacionesError(
                f"Lectura de {periodo} truncada en {paginas} páginas "
                f"(LIQUIDACIONES_MAX_PAGINAS={settings.LIQUIDACIONES_MAX_PAGINAS}). "
                f"No se compara para no reportar bajas inexistentes."
            )

        logger.info(
            f"[Liquidos] {periodo}: {len(resultado)} liquidaciones leídas "
            f"en {paginas} página(s)"
        )
        return resultado

    # ---------------------------------------------------------------
    # Snapshot (target congelado)
    # ---------------------------------------------------------------

    def tiene_snapshot(self, periodo: str) -> bool:
        row = self.db.execute(
            text("SELECT 1 FROM app.liquidaciones_snapshot WHERE periodo = :p LIMIT 1"),
            {"p": periodo},
        ).fetchone()
        return row is not None

    def leer_snapshot(self, periodo: str) -> Dict[int, Dict[str, Any]]:
        rows = self.db.execute(
            text("""
                SELECT employee_id, rut, income_net, income_gross, income_afp, income_ips
                FROM app.liquidaciones_snapshot
                WHERE periodo = :p
            """),
            {"p": periodo},
        ).fetchall()
        return {
            int(r[0]): {
                "rut": r[1],
                "income_net": _a_decimal(r[2]),
                "income_gross": _a_decimal(r[3]),
                "income_afp": _a_decimal(r[4]),
                "income_ips": _a_decimal(r[5]),
            }
            for r in rows
        }

    def _upsert_snapshot(self, periodo: str, emp_id: int, fila: Dict[str, Any]) -> None:
        self.db.execute(
            text("""
                INSERT INTO app.liquidaciones_snapshot
                    (periodo, employee_id, rut, income_net, income_gross, income_afp, income_ips)
                VALUES (:p, :e, :rut, :net, :gross, :afp, :ips)
                ON CONFLICT (periodo, employee_id) DO UPDATE SET
                    rut          = EXCLUDED.rut,
                    income_net   = EXCLUDED.income_net,
                    income_gross = EXCLUDED.income_gross,
                    income_afp   = EXCLUDED.income_afp,
                    income_ips   = EXCLUDED.income_ips
            """),
            {
                "p": periodo,
                "e": emp_id,
                "rut": fila.get("rut"),
                "net": fila.get("income_net"),
                "gross": fila.get("income_gross"),
                "afp": fila.get("income_afp"),
                "ips": fila.get("income_ips"),
            },
        )

    def guardar_snapshot(self, periodo: str, liquidaciones: Dict[int, Dict[str, Any]]) -> int:
        for emp_id, fila in liquidaciones.items():
            self._upsert_snapshot(periodo, emp_id, fila)
        self.db.commit()
        logger.info(f"[Liquidos] Snapshot {periodo} congelado: {len(liquidaciones)} empleados")
        return len(liquidaciones)

    def rebaseline(self, periodo: str, emp_id: int, fila: Dict[str, Any]) -> None:
        """Acepta los valores actuales como nuevo target (corrección legítima)."""
        self._upsert_snapshot(periodo, emp_id, fila)
        self.db.commit()

    # ---------------------------------------------------------------
    # Barrido
    # ---------------------------------------------------------------

    def registrar_descuadres(self, periodo: str, difs: List[Descuadre]) -> List[Dict[str, Any]]:
        """
        Inserta las diferencias. El índice único de dedup hace que un descuadre ya
        reportado no se vuelva a insertar, así que solo se devuelven los nuevos.
        """
        nuevos: List[Dict[str, Any]] = []
        for d in difs:
            res = self.db.execute(
                text("""
                    INSERT INTO app.liquidaciones_descuadre
                        (periodo, employee_id, rut, campo, valor_target, valor_actual)
                    VALUES (:p, :e, :rut, :campo, :t, :a)
                    ON CONFLICT DO NOTHING
                    RETURNING id
                """),
                {
                    "p": periodo, "e": d.employee_id, "rut": d.rut,
                    "campo": d.campo, "t": d.valor_target, "a": d.valor_actual,
                },
            ).fetchone()
            if res:
                nuevos.append({
                    "employee_id": d.employee_id,
                    "rut": d.rut,
                    "campo": d.campo,
                    "valor_target": str(d.valor_target) if d.valor_target is not None else None,
                    "valor_actual": str(d.valor_actual) if d.valor_actual is not None else None,
                })
        self.db.commit()
        return nuevos

    async def barrido(self, hoy: Optional[date] = None) -> Dict[str, Any]:
        """
        Un ciclo completo: valida ventana, congela el target si es el primer
        barrido del período, y compara.
        """
        hoy = hoy or date.today()
        en_ventana, motivo = self.ventana_post_cierre(hoy)
        if not en_ventana:
            return {"ejecutado": False, "motivo": motivo}

        periodo = _periodo_actual(hoy)
        liquidaciones = await self.fetch_liquidaciones(periodo)
        if not liquidaciones:
            return {"ejecutado": False, "motivo": f"BUK no devolvió liquidaciones para {periodo}"}

        # Primer barrido del período: el día del cierre se congela el target.
        if not self.tiene_snapshot(periodo):
            total = self.guardar_snapshot(periodo, liquidaciones)
            return {
                "ejecutado": True,
                "periodo": periodo,
                "accion": "snapshot_inicial",
                "empleados": total,
                "trabajadores_descuadrados": [],
            }

        target = self.leer_snapshot(periodo)
        difs = diff_liquidaciones(target, liquidaciones)
        nuevos = self.registrar_descuadres(periodo, difs)

        return {
            "ejecutado": True,
            "periodo": periodo,
            "accion": "comparacion",
            "empleados": len(liquidaciones),
            "diferencias_totales": len(difs),
            "trabajadores_descuadrados": agrupar_por_rut(nuevos),
        }
