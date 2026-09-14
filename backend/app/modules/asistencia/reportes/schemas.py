"""Entrada del reporte de bono de asistencia.

La salida (tabla) reusa el DataResponse del módulo — el componente de
tabla del frontend la consume sin cambios.
"""
from typing import Any

from pydantic import BaseModel, Field


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


class SimulacionRequest(ReporteRequest):
    """Cierre anticipado: '¿cómo quedaría el bono si el mes cerrara hoy?'.

    El corte SIEMPRE lo manda el cliente. No se cae a date.today() en el
    servidor: el contenedor puede estar en otra zona horaria que el navegador y
    entre las 21:00 y medianoche en Chile un backend en UTC ya está en mañana.
    """

    # Día del cierre simulado, yyyy-mm-dd. Debe caer dentro de [q1_inicio, q2_fin].
    simular_hasta: str
    # Días de gracia para que un turno ya terminado alcance a llegar al dataset
    # de marcajes. Por debajo de esto no se considera observable.
    lag_dias: int = Field(default=1, ge=0, le=15)
    # Cuántos olvidos de marca asume cada día pendiente. 1 = "olvidó la salida",
    # que es el escenario pedido; 2 = olvidó entrada y salida, el peor posible.
    # Tope 2: no caben más marcas en un día.
    olvidos_por_dia: int = Field(default=1, ge=0, le=2)
    # Atrasos por día pendiente. Tope 1: solo se llega tarde a la entrada.
    atrasos_por_dia: int = Field(default=0, ge=0, le=1)
