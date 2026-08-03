from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.repositories.desvinculacion_repository import DesvinculacionRepository
from app.schemas.desvinculacion import CorreoSalidaRequest, DesvinculacionUpsert
from app.services.email_service import send_email_graph

MOTIVOS_SALIDA = {
    "renuncia": "ha renunciado",
    "desvinculacion": "se ha desvinculado a",
}

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


def enviar_correo_salida(rut: str, data: CorreoSalidaRequest) -> bool:
    """Envía el aviso de salida de personal a los destinatarios configurados."""
    if not settings.SALIDA_PERSONAL_TO:
        raise ValueError("SALIDA_PERSONAL_TO no está configurado")

    fecha = data.fecha_salida.strftime("%d-%m-%Y")
    cargo = f" ({data.cargo})" if data.cargo else ""
    cuerpo = (
        f"<p>Estimados.</p>"
        f"<p>&nbsp;&nbsp;&nbsp;&nbsp;Se les informa que con fecha de {fecha}, "
        f"{MOTIVOS_SALIDA[data.motivo]} {data.nombre_trabajador}, "
        f"Rut: {rut}{cargo}.</p>"
        f"<p>Atte.</p>"
    )
    return send_email_graph(
        to=settings.SALIDA_PERSONAL_TO,
        cc=settings.SALIDA_PERSONAL_CC,
        subject=f"Salida de personal - {data.nombre_trabajador}",
        html_body=cuerpo,
        sender=settings.SALIDA_PERSONAL_FROM,
    )


class DesvinculacionService:
    def __init__(self, db: Session):
        self.repo = DesvinculacionRepository(db)

    def get_by_rut(self, rut: str) -> Optional[Dict[str, Any]]:
        row = self.repo.get_by_rut(rut)
        return {**row, "estado": derivar_estado(row)} if row else None

    def list_all(self) -> list[Dict[str, Any]]:
        return [{**row, "estado": derivar_estado(row)} for row in self.repo.list_all()]

    def guardar(
        self, rut: str, data: DesvinculacionUpsert, created_by: Optional[str]
    ) -> Dict[str, Any]:
        row = self.repo.upsert(
            rut=rut,
            causal=data.causal,
            fecha_termino=data.fecha_termino,
            payload_json=data.payload_json,
            created_by=created_by,
            total_finiquito=data.total_finiquito,
        )
        return {**row, "estado": derivar_estado(row)}

    def marcar_hito(self, rut: str, hito: str) -> Optional[Dict[str, Any]]:
        """Retorna None si el hito no existe o si no hay proceso guardado para ese RUT."""
        columna = HITOS.get(hito)
        if not columna:
            return None
        row = self.repo.marcar_hito(rut, columna)
        return {**row, "estado": derivar_estado(row)} if row else None
