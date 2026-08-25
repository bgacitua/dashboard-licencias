"""Entrada del reporte de bono de asistencia.

La salida (tabla) reusa el DataResponse del módulo — el componente de
tabla del frontend la consume sin cambios.
"""
from typing import Any

from pydantic import BaseModel


class ReporteParams(BaseModel):
    # Quincenas del mes (cambian mes a mes). P1 = [q1_inicio, q2_inicio),
    # P2 = [q2_inicio, q2_fin]. Formato yyyy-mm-dd.
    q1_inicio: str
    q2_inicio: str   # corte entre quincena 1 y 2
    q2_fin: str
    valor_bono: float = 70000.0  # Monto = Bono Total × valor_bono (0.5→35k, 1.0→70k)
    # Variante "JC_": mismo reporte, acotado a los cargos/empresas de jc.CARGOS/EMPRESAS.
    # Solo afecta la descarga .xlsx.
    jc: bool = False


class ReporteRequest(ReporteParams):
    # Filas del reporte de atrasos, ya parseadas en el frontend (SheetJS).
    # Cada fila: {"RUT", "Día", "Atraso con Holgura", ...}. Vacío = Atrasos 0.
    atrasos: list[dict[str, Any]] = []
