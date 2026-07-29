from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.repositories.desvinculacion_repository import DesvinculacionRepository
from app.schemas.desvinculacion import DesvinculacionUpsert

# Lista blanca hito -> columna. El nombre de columna se interpola en el SQL del
# repositorio, así que este mapa es la única fuente de nombres válidos.
HITOS = {
    "carta": "carta_generada_at",
    "finiquito": "finiquito_generado_at",
    "correo": "correo_enviado_at",
}


def derivar_estado(row: Dict[str, Any]) -> str:
    """Estado a partir de los timestamps, del hito más avanzado hacia atrás."""
    if row.get("correo_enviado_at"):
        return "notificado"
    if row.get("finiquito_generado_at"):
        return "finiquito_generado"
    if row.get("carta_generada_at"):
        return "carta_generada"
    return "borrador"


class DesvinculacionService:
    def __init__(self, db: Session):
        self.repo = DesvinculacionRepository(db)

    def get_by_rut(self, rut: str) -> Optional[Dict[str, Any]]:
        row = self.repo.get_by_rut(rut)
        return {**row, "estado": derivar_estado(row)} if row else None

    def guardar(
        self, rut: str, data: DesvinculacionUpsert, created_by: Optional[str]
    ) -> Dict[str, Any]:
        row = self.repo.upsert(
            rut=rut,
            causal=data.causal,
            fecha_termino=data.fecha_termino,
            payload_json=data.payload_json,
            created_by=created_by,
        )
        return {**row, "estado": derivar_estado(row)}

    def marcar_hito(self, rut: str, hito: str) -> Optional[Dict[str, Any]]:
        """Retorna None si el hito no existe o si no hay proceso guardado para ese RUT."""
        columna = HITOS.get(hito)
        if not columna:
            return None
        row = self.repo.marcar_hito(rut, columna)
        return {**row, "estado": derivar_estado(row)} if row else None
