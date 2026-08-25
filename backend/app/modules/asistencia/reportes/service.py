"""ReportService — reporte de bono de asistencia.

Pipeline:
  [1] Postgres (ReportesRepo): base por rut/periodo — datos del trabajador +
      dias_ausencias por periodo (suma para el bono).
  [2] Atrasos (xls subido) + Olvido Marca (Buk auditoría, Dispositivo=API-Olvido-de-marca).
  [3] merge por rut + cálculo de bono (función pura) -> filas para tabla/xlsx.
"""
from asyncio import Semaphore, gather
from datetime import date, datetime

from fastapi.concurrency import run_in_threadpool

from app.core.logging_config import logger as _log

from ..client import ExternalClient, to_buk_date
from ..config import AsistenciaSettings as Settings
from . import incidencias, jc
from .repository import ReportesRepo
from .schemas import ReporteParams

# Orden final exacto de columnas del reporte (21).
COLUMNAS = [
    "Nombre", "Rut", "Fecha ingreso", "Status", "Cargo", "Centro de Costo",
    "Nombre Empresa",
    "Licencias Periodo 1", "Licencias Periodo 2",
    "Permisos Periodo 1", "Permisos Periodo 2",
    "Inasistencias Periodo 1", "Inasistencias Periodo 2",
    "Atrasos Periodo 1", "Atrasos Periodo 2",
    "Olvido Marca Periodo 1", "Olvido Marca Periodo 2",
    "Bono Asistencia P1", "Bono Asistencia P2", "Bono Total", "Monto",
]


def _parse_date(v: object) -> date | None:
    """A date. Inparseable -> None (no descalifica, = pd.to_datetime coerce -> NaT)."""
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(v.strip()[:10], fmt).date()
            except ValueError:
                continue
    return None


def _iso(v: object) -> str:
    """date/datetime -> 'yyyy-mm-dd'; otros -> str. Para celdas de las hojas."""
    if isinstance(v, (date, datetime)):
        return v.isoformat()[:10]
    return "" if v is None else str(v)


def bono_periodo(
    ausencias: float, atrasos: float, olvidos: float,
    fecha_ingreso: date | None, corte_elegibilidad: date,
) -> float:
    """0.5 si el periodo está limpio; 0 si no. Réplica de calcular_bono_pN.

    - dias_ausencias (Licencias+Permisos+Inasistencias) >= 1 -> 0
    - Atrasos >= 3 -> 0
    - Olvido Marca >= 3 -> 0
    - Ingresó DESPUÉS del corte de elegibilidad -> 0
      (P1: corte=q1_inicio; P2: corte=q2_inicio). Ingreso None -> no descalifica.
    """
    if ausencias >= 1:
        return 0.0
    if atrasos >= 3:
        return 0.0
    if olvidos >= 3:
        return 0.0
    if fecha_ingreso is not None and fecha_ingreso > corte_elegibilidad:
        return 0.0
    return 0.5


class ReportService:
    def __init__(
        self,
        reportes: ReportesRepo,
        settings: Settings,
        *,
        buk: ExternalClient | None = None,
    ) -> None:
        self._reportes = reportes
        self._settings = settings
        self._buk = buk

    async def generar(self, p: ReporteParams, atrasos_rows: list[dict] | None = None) -> list[dict]:
        return (await self._compute(p, atrasos_rows or [], con_detalle=False))["principal"]

    async def generar_sheets(
        self, p: ReporteParams, atrasos_rows: list[dict] | None = None
    ) -> list[tuple[str, list[dict], list[str]]]:
        """Reporte + hojas de auditoría para el .xlsx."""
        return self._sheets(await self._compute(p, atrasos_rows or [], con_detalle=True))

    async def _compute(self, p: ReporteParams, atrasos_rows: list[dict], con_detalle: bool) -> dict:
        base = await run_in_threadpool(self._reportes.query, p.q1_inicio, p.q2_inicio, p.q2_fin)
        if p.jc:
            base = [r for r in base if jc.incluye(r.get("name_role"), r.get("first_level_name"))]
        q1, q2, qf = _parse_date(p.q1_inicio), _parse_date(p.q2_inicio), _parse_date(p.q2_fin)
        aud_rows = await self._fetch_auditoria(q1, qf)
        # Detalle por-incidencia solo cuando se piden hojas (evita el 2º query en /data).
        detalle = (
            await run_in_threadpool(self._reportes.query_detalle, p.q1_inicio, p.q2_inicio, p.q2_fin)
            if con_detalle else []
        )
        # Permisos por horas: solo alimentan la hoja de auditoría del xlsx, no el bono.
        permisos_horas = (
            await run_in_threadpool(self._reportes.query_permisos_horas, p.q1_inicio, p.q2_fin)
            if con_detalle else []
        )
        atrasos = incidencias.contar_atrasos(atrasos_rows, q1, q2, qf) if atrasos_rows else {}
        olvidos = incidencias.contar_olvidos(aud_rows, q1, q2, qf)
        if not olvidos:
            # Hoja "Olvidos Marca" vacía: dice en qué eslabón se cortó (sin filas de
            # auditoría vs. filas que ninguna es olvido vs. todas fuera de rango).
            vistos = sorted({str(r.get(incidencias.AUD_COL_DISPOSITIVO, "")) for r in aud_rows})
            _log.warning(
                "[reportes] 0 olvidos de marca | filas auditoría=%d | obras=%d | dispositivos vistos=%s",
                len(aud_rows), len(self._settings.obras_list), vistos[:10],
            )
        principal = self._armar(base, atrasos, olvidos, p, q1, q2)
        return {"p": p, "base": base, "principal": principal, "detalle": detalle,
                "atrasos_rows": atrasos_rows, "aud_rows": aud_rows, "q1": q1, "q2": q2, "qf": qf,
                "permisos_horas": permisos_horas}

    async def _fetch_auditoria(self, q1: date, qf: date) -> list[dict]:
        """Filas crudas de Auditoría de Marca, unidas de todas las obras configuradas.

        Buk exige obra_id -> se consulta cada obra (el cruce final es por rut, así
        que obras de más no molestan). Obra inválida se omite (ver _aud_obra).
        ponytail: recorre todas las obras de config; acotar con param obra_id si
        algún día el reporte se limita a una sola.
        """
        if self._buk is None:
            return []
        obras = [o["id"] for o in self._settings.obras_list]
        if not obras:
            return []
        base: dict[str, object] = {}
        if (d := to_buk_date(q1.isoformat())):
            base["from"] = d
        if (h := to_buk_date(qf.isoformat())):
            base["to"] = h
        sem = Semaphore(self._settings.crawl_concurrency)
        results = await gather(*(self._aud_obra(base, o, sem) for o in obras))
        return [r for chunk in results for r in chunk]

    async def _aud_obra(self, base: dict, obra_id: str, sem: Semaphore) -> list[dict]:
        """Auditoría de una obra; tolera fallo (obra inválida) devolviendo []."""
        try:
            async with sem:
                return await self._buk.get_paged(
                    self._settings.auditoria_api_url, {**base, "obra_id": obra_id}
                )
        except Exception as exc:  # obra que no pertenece a la empresa, timeout, etc.
            _log.warning("[reportes] auditoría obra %s omitida: %s", obra_id, exc)
            return []

    def _armar(
        self, base: list[dict], atrasos: dict, olvidos: dict,
        p: ReporteParams, q1: date, q2: date,
    ) -> list[dict]:
        out: list[dict] = []
        for r in base:
            rut = str(r.get("rut", ""))
            key = incidencias.norm_rut(rut)
            atr = atrasos.get(key, {}); olv = olvidos.get(key, {})
            atr_p1 = atr.get("p1", 0); atr_p2 = atr.get("p2", 0)
            olv_p1 = olv.get("p1", 0); olv_p2 = olv.get("p2", 0)
            ingreso = _parse_date(r.get("active_since"))

            # Desglose Licencias/Permisos/Inasistencias que emite la query adaptada.
            lic1 = float(r.get("licencias_p1", 0) or 0); lic2 = float(r.get("licencias_p2", 0) or 0)
            per1 = float(r.get("permisos_p1", 0) or 0);  per2 = float(r.get("permisos_p2", 0) or 0)
            ina1 = float(r.get("inasistencias_p1", 0) or 0); ina2 = float(r.get("inasistencias_p2", 0) or 0)

            # Suma de ausencias para el bono: dias_ausencias si la query lo trae,
            # si no, la suma del desglose. Ambos deben coincidir.
            aus_p1 = float(r.get("dias_ausencias_periodo1", lic1 + per1 + ina1) or 0)
            aus_p2 = float(r.get("dias_ausencias_periodo2", lic2 + per2 + ina2) or 0)

            bono_p1 = bono_periodo(aus_p1, atr_p1, olv_p1, ingreso, q1)
            bono_p2 = bono_periodo(aus_p2, atr_p2, olv_p2, ingreso, q2)
            bono_total = bono_p1 + bono_p2

            out.append({
                "Nombre": r.get("full_name", ""),
                "Rut": rut,
                "Fecha ingreso": r.get("active_since", ""),
                "Status": r.get("status", ""),
                "Cargo": r.get("name_role", ""),
                "Centro de Costo": r.get("cost_center", ""),
                "Nombre Empresa": r.get("first_level_name", ""),
                "Licencias Periodo 1": lic1, "Licencias Periodo 2": lic2,
                "Permisos Periodo 1": per1, "Permisos Periodo 2": per2,
                "Inasistencias Periodo 1": ina1, "Inasistencias Periodo 2": ina2,
                "Atrasos Periodo 1": atr_p1, "Atrasos Periodo 2": atr_p2,
                "Olvido Marca Periodo 1": olv_p1, "Olvido Marca Periodo 2": olv_p2,
                "Bono Asistencia P1": bono_p1, "Bono Asistencia P2": bono_p2,
                "Bono Total": bono_total,
                "Monto": bono_total * p.valor_bono,
            })
        return out

    @staticmethod
    def columnas(_rows: list[dict]) -> list[str]:
        return COLUMNAS

    def _sheets(self, ctx: dict) -> list[tuple[str, list[dict], list[str]]]:
        """Hojas del .xlsx: principal + auditoría (ausencias, atrasos, olvidos, ingreso reciente)."""
        base, q1, q2, qf = ctx["base"], ctx["q1"], ctx["q2"], ctx["qf"]

        # Ausencias: detalle por-incidencia (query_detalle). Una fila por incidencia × periodo.
        aus_cols = ["Rut", "Nombre", "Cargo", "Periodo", "Tipo Permiso", "Categoría",
                    "Fecha Inicio", "Fecha Fin", "Días en Periodo"]
        ausencias = [{
            "Rut": r.get("rut", ""), "Nombre": r.get("full_name", ""), "Cargo": r.get("name_role", ""),
            "Periodo": r.get("periodo", ""), "Tipo Permiso": r.get("type_permission", ""),
            "Categoría": r.get("categoria", ""),
            "Fecha Inicio": _iso(r.get("fecha_inicio_en_periodo")),
            "Fecha Fin": _iso(r.get("fecha_fin_en_periodo")),
            "Días en Periodo": r.get("dias_en_periodo", ""),
        } for r in ctx["detalle"]]

        # Ingreso reciente: perdieron el bono de un periodo por fecha de ingreso.
        ing_cols = ["Rut", "Nombre", "Fecha ingreso", "Periodos sin bono por ingreso"]
        ingreso: list[dict] = []
        for r in base:
            ing = _parse_date(r.get("active_since"))
            if ing is None:
                continue
            afecta = [per for per, corte in (("P1", q1), ("P2", q2)) if ing > corte]
            if afecta:
                ingreso.append({"Rut": r.get("rut", ""), "Nombre": r.get("full_name", ""),
                                "Fecha ingreso": r.get("active_since", ""),
                                "Periodos sin bono por ingreso": ", ".join(afecta)})

        sheets = [
            ("Bono Asistencia", ctx["principal"], COLUMNAS),
            ("Ausencias", ausencias, aus_cols),
            ("Atrasos", incidencias.detalle_atrasos(ctx["atrasos_rows"], q1, q2, qf),
             ["RUT", "Día", "Atraso con Holgura", "Periodo"]),
            ("Olvidos Marca", incidencias.detalle_olvidos(ctx["aud_rows"], q1, q2, qf),
             ["RUT", "Fecha", "Obra", "Periodo"]),
            ("Ingreso Reciente", ingreso, ing_cols),
            # ponytail: hoja temporal de auditoría — atraso y permiso_por_horas el mismo
            # día. No afecta el bono. Borrar cuando el cruce se haga en la BD.
            ("Atraso vs Permiso Horas",
             incidencias.cruce_atrasos_permiso_horas(
                 ctx["atrasos_rows"], ctx["permisos_horas"], q1, q2, qf),
             incidencias.CRUCE_COLS),
        ]
        if not ctx["p"].jc:
            return sheets
        # JC_: base ya viene filtrada por cargo/empresa; las hojas de detalle salen de
        # queries/archivos sin ese filtro, así que se acotan a los mismos ruts.
        ruts = {incidencias.norm_rut(r.get("rut")) for r in base}
        return [
            (name, [r for r in rows if incidencias.norm_rut(r.get("Rut", r.get("RUT"))) in ruts], cols)
            for name, rows, cols in sheets
        ]


# ponytail: self-check del bono (money path).
# `python -m app.modules.asistencia.reportes.service`
if __name__ == "__main__":
    import asyncio

    d, corte = date(2026, 6, 1), date(2026, 6, 16)
    assert bono_periodo(0, 0, 0, date(2020, 1, 1), d) == 0.5       # limpio
    assert bono_periodo(1, 0, 0, date(2020, 1, 1), d) == 0.0       # 1 ausencia
    assert bono_periodo(0, 3, 0, date(2020, 1, 1), d) == 0.0       # 3 atrasos
    assert bono_periodo(0, 2, 2, date(2020, 1, 1), d) == 0.5       # 2 atrasos ok
    assert bono_periodo(0, 0, 3, date(2020, 1, 1), d) == 0.0       # 3 olvidos
    assert bono_periodo(0, 0, 0, date(2026, 6, 10), d) == 0.0      # ingreso post-corte
    assert bono_periodo(0, 0, 0, d, d) == 0.5                      # ingreso == corte
    assert bono_periodo(0, 0, 0, None, d) == 0.5                   # ingreso None

    class _FakeRepo:
        def query(self, q1_inicio, q2_inicio, q2_fin):
            return [{
                "rut": "12.345.678-9", "full_name": "Ana", "active_since": "2020-01-01",
                "status": "activo", "name_role": "Operario", "cost_center": "CC1",
                "first_level_name": "ACME",
                "licencias_p1": 0, "permisos_p1": 0, "inasistencias_p1": 0,
                "licencias_p2": 0, "permisos_p2": 0, "inasistencias_p2": 0,
            }]

        def query_detalle(self, q1_inicio, q2_inicio, q2_fin):
            return [{
                "rut": "12.345.678-9", "full_name": "Ana", "name_role": "Operario",
                "periodo": 1, "type_permission": "Licencia médica", "categoria": "licencia",
                "fecha_inicio_en_periodo": date(2026, 6, 15), "fecha_fin_en_periodo": date(2026, 6, 17),
                "dias_en_periodo": 3,
            }]

        def query_permisos_horas(self, q1_inicio, q2_fin):
            return [{"rut": "12.345.678-9", "full_name": "Ana", "name_role": "Operario",
                     "start_date": date(2026, 6, 20), "end_date": date(2026, 6, 20),
                     "day_percent": "0.5"}]

    class _NoSettings:
        obras_list: list = []

    p = ReporteParams(q1_inicio="2026-06-14", q2_inicio="2026-06-29",
                      q2_fin="2026-07-14", valor_bono=50000)
    svc = ReportService(_FakeRepo(), _NoSettings())  # type: ignore[arg-type]
    rows = asyncio.run(svc.generar(p, atrasos_rows=None))
    assert list(rows[0].keys()) == COLUMNAS, "orden de columnas exacto"
    assert rows[0]["Bono Total"] == 1.0, rows[0]["Bono Total"]
    assert rows[0]["Monto"] == 50000.0, rows[0]["Monto"]

    sheets = asyncio.run(svc.generar_sheets(
        p, atrasos_rows=[{"RUT": "12.345.678-9", "Día": "2026-06-20", "Atraso con Holgura": "0:10:00"}]))
    names = [s[0] for s in sheets]
    assert names == ["Bono Asistencia", "Ausencias", "Atrasos", "Olvidos Marca",
                     "Ingreso Reciente", "Atraso vs Permiso Horas"], names
    cruce = sheets[5][1]
    assert len(cruce) == 1 and cruce[0]["Día"] == "2026-06-20", cruce

    # JC_: filtra la base por cargo/empresa y propaga el recorte a todas las hojas.
    atrasos_demo = [{"RUT": "12.345.678-9", "Día": "2026-06-20", "Atraso con Holgura": "0:10:00"}]
    jc.CARGOS, jc.EMPRESAS = ["Operario"], ["ACME"]
    p_jc = p.model_copy(update={"jc": True})
    assert asyncio.run(svc.generar(p_jc, atrasos_demo)), "cargo/empresa que sí matchean"

    jc.CARGOS = ["Cargo Inexistente"]
    assert asyncio.run(svc.generar(p_jc, atrasos_demo)) == [], "cargo que no matchea -> vacío"
    vacias = asyncio.run(svc.generar_sheets(p_jc, atrasos_demo))
    assert all(rows == [] for _, rows, _ in vacias), "hojas de detalle también se acotan"
    assert [s[0] for s in vacias] == names, "mismas hojas, mismo orden que el reporte normal"
    aus = dict(zip(("name", "rows", "cols"), sheets[1]))
    assert aus["rows"][0]["Tipo Permiso"] == "Licencia médica"
    assert aus["rows"][0]["Fecha Inicio"] == "2026-06-15" and aus["rows"][0]["Días en Periodo"] == 3
    print("reportes service demo OK")
