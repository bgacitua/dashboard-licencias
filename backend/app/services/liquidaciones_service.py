"""
Alerta de descuadre de líquidos en período de cierre.

El día del cierre se congela un snapshot de los líquidos del mes (el target).
Desde ahí y hasta fin de mes los líquidos no deben moverse, así que cada barrido
posterior compara contra ese target y cualquier diferencia se reporta.

No hay umbral: el delta esperado es exactamente 0.

Las fechas de cierre salen de app.calendariocierres, la misma tabla que usa
ContractAlertsService, para que ambos mecanismos no se desincronicen.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy import text

from app.core.config import settings
from app.core.logging_config import logger


class LiquidacionesError(Exception):
    pass


# Campos candidatos para el líquido dentro de cada liquidación. BUK no expone el
# esquema en apidocs, así que se prueba en orden y se usa el primero presente.
# Si tu tenant devuelve otro nombre, agrégalo al principio de la lista.
_CAMPOS_LIQUIDO = ("liquid", "net_payment", "liquid_payment", "total_liquid", "amount")

_CAMPOS_NOMBRE = ("full_name", "name", "employee_name")


def _periodo_actual(hoy: date) -> str:
    return f"{hoy.year}-{hoy.month:02d}"


def _a_decimal(valor: Any) -> Optional[Decimal]:
    if valor is None or valor == "":
        return None
    try:
        return Decimal(str(valor)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def _extraer_liquido(item: Dict[str, Any]) -> Optional[Decimal]:
    for campo in _CAMPOS_LIQUIDO:
        if campo in item:
            return _a_decimal(item[campo])
    return None


def _extraer_nombre(item: Dict[str, Any]) -> Optional[str]:
    for campo in _CAMPOS_NOMBRE:
        if item.get(campo):
            return str(item[campo])[:200]
    return None


def diff_liquidos(
    target: Dict[int, Decimal],
    actual: Dict[int, Decimal],
) -> List[Tuple[int, Optional[Decimal], Optional[Decimal]]]:
    """
    Compara el snapshot congelado contra la lectura actual.

    Devuelve (employee_id, liquido_target, liquido_actual) por cada diferencia:
      - monto distinto   -> ambos valores presentes
      - baja post-cierre -> liquido_actual is None
      - alta post-cierre -> liquido_target is None

    Es una comparación de conjuntos además de montos: un empleado que aparece o
    desaparece después del cierre también es un descuadre.
    """
    difs: List[Tuple[int, Optional[Decimal], Optional[Decimal]]] = []
    for emp_id in sorted(set(target) | set(actual)):
        t = target.get(emp_id)
        a = actual.get(emp_id)
        if t != a:
            difs.append((emp_id, t, a))
    return difs


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

    async def fetch_liquidos(self, periodo: str) -> Dict[int, Dict[str, Any]]:
        """
        Trae todas las liquidaciones del período, paginadas de a 100.
        Devuelve {employee_id: {"liquido": Decimal, "nombre": str|None}}.
        """
        anio, mes = periodo.split("-")
        url = f"{settings.BUK_API_BASE_URL}{settings.LIQUIDACIONES_ENDPOINT_PATH}"
        headers = {"auth_token": settings.BUK_API_KEY, "Content-Type": "application/json"}

        resultado: Dict[int, Dict[str, Any]] = {}
        page = 1
        corte_por_limite = True
        async with httpx.AsyncClient(timeout=60.0) as client:
            while page <= settings.LIQUIDACIONES_MAX_PAGINAS:
                params = {"month": int(mes), "year": int(anio), "page": page}
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
                items = data.get("data", [])
                if not items:
                    corte_por_limite = False
                    break

                for item in items:
                    emp_id = item.get("employee_id") or item.get("id")
                    liquido = _extraer_liquido(item)
                    if emp_id is None or liquido is None:
                        continue
                    resultado[int(emp_id)] = {
                        "liquido": liquido,
                        "nombre": _extraer_nombre(item),
                    }

                pagination = data.get("pagination") or {}
                total_pages = pagination.get("total_pages")
                if total_pages and page >= int(total_pages):
                    corte_por_limite = False
                    break
                page += 1

        if corte_por_limite:
            # Truncar la lectura inventa "bajas" que no existen, así que se avisa fuerte.
            logger.warning(
                f"[Liquidos] Corte por límite de páginas "
                f"({settings.LIQUIDACIONES_MAX_PAGINAS}) en {periodo}. "
                f"Subir LIQUIDACIONES_MAX_PAGINAS si la dotación creció."
            )

        logger.info(f"[Liquidos] {periodo}: {len(resultado)} liquidaciones leídas")
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

    def leer_snapshot(self, periodo: str) -> Dict[int, Decimal]:
        rows = self.db.execute(
            text("SELECT employee_id, liquido FROM app.liquidaciones_snapshot WHERE periodo = :p"),
            {"p": periodo},
        ).fetchall()
        return {int(r[0]): _a_decimal(r[1]) for r in rows}

    def guardar_snapshot(self, periodo: str, liquidos: Dict[int, Dict[str, Any]]) -> int:
        for emp_id, datos in liquidos.items():
            self.db.execute(
                text("""
                    INSERT INTO app.liquidaciones_snapshot (periodo, employee_id, liquido)
                    VALUES (:p, :e, :l)
                    ON CONFLICT (periodo, employee_id) DO UPDATE SET liquido = EXCLUDED.liquido
                """),
                {"p": periodo, "e": emp_id, "l": datos["liquido"]},
            )
        self.db.commit()
        logger.info(f"[Liquidos] Snapshot {periodo} congelado: {len(liquidos)} empleados")
        return len(liquidos)

    def rebaseline(self, periodo: str, employee_id: int, liquido: Decimal) -> None:
        """Acepta el valor actual como nuevo target (corrección legítima)."""
        self.db.execute(
            text("""
                INSERT INTO app.liquidaciones_snapshot (periodo, employee_id, liquido)
                VALUES (:p, :e, :l)
                ON CONFLICT (periodo, employee_id) DO UPDATE SET liquido = EXCLUDED.liquido
            """),
            {"p": periodo, "e": employee_id, "l": liquido},
        )
        self.db.commit()

    # ---------------------------------------------------------------
    # Barrido
    # ---------------------------------------------------------------

    def registrar_descuadres(
        self,
        periodo: str,
        difs: List[Tuple[int, Optional[Decimal], Optional[Decimal]]],
        nombres: Dict[int, Optional[str]],
    ) -> List[Dict[str, Any]]:
        """
        Inserta las diferencias. El índice único de dedup hace que un descuadre ya
        reportado no se vuelva a insertar, así que solo se devuelven los nuevos.
        """
        nuevos: List[Dict[str, Any]] = []
        for emp_id, target, actual in difs:
            res = self.db.execute(
                text("""
                    INSERT INTO app.liquidaciones_descuadre
                        (periodo, employee_id, nombre, liquido_target, liquido_actual)
                    VALUES (:p, :e, :n, :t, :a)
                    ON CONFLICT DO NOTHING
                    RETURNING id
                """),
                {"p": periodo, "e": emp_id, "n": nombres.get(emp_id), "t": target, "a": actual},
            ).fetchone()
            if res:
                nuevos.append({
                    "employee_id": emp_id,
                    "nombre": nombres.get(emp_id),
                    "liquido_target": str(target) if target is not None else None,
                    "liquido_actual": str(actual) if actual is not None else None,
                    "tipo": (
                        "alta_post_cierre" if target is None
                        else "baja_post_cierre" if actual is None
                        else "monto_modificado"
                    ),
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
        liquidos = await self.fetch_liquidos(periodo)
        if not liquidos:
            return {"ejecutado": False, "motivo": f"BUK no devolvió liquidaciones para {periodo}"}

        # Primer barrido del período: el día del cierre se congela el target.
        if not self.tiene_snapshot(periodo):
            total = self.guardar_snapshot(periodo, liquidos)
            return {
                "ejecutado": True,
                "periodo": periodo,
                "accion": "snapshot_inicial",
                "empleados": total,
                "descuadres": [],
            }

        target = self.leer_snapshot(periodo)
        actual = {emp: datos["liquido"] for emp, datos in liquidos.items()}
        nombres = {emp: datos["nombre"] for emp, datos in liquidos.items()}

        difs = diff_liquidos(target, actual)
        nuevos = self.registrar_descuadres(periodo, difs, nombres)

        return {
            "ejecutado": True,
            "periodo": periodo,
            "accion": "comparacion",
            "empleados": len(actual),
            "diferencias_totales": len(difs),
            "descuadres": nuevos,
        }
