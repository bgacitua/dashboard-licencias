"""Check del recordatorio de alertas de contratos.

El recordatorio sale justo cuando el token anterior cumplió sus 72 horas (la
consulta de pendientes pide 3 días sin alerta), así que reusarlo mandaba un link
que abría en "Link inválido". Acá se fija que cada recordatorio emite token
nuevo, que la ventana se reabre solo si el correo salió, y que la cadencia no se
toca: mientras nadie responda, el recordatorio vuelve a salir al día siguiente.

Usa un tracking falso en memoria; no toca la BD.
"""
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.security import create_response_token
from app.services import contract_alerts_service as mod
from app.services.contract_alerts_service import (
    TOKEN_TTL_HORAS,
    ContractAlertsService,
)

TOKEN_VIEJO = "token-del-envio-anterior"


class FakeTracking:
    def __init__(self, emitido):
        self.ancla_inicial = emitido
        self.row = {
            "id": 1,
            "employee_id": 99,
            "rut": "11.111.111-1",
            "employee_name": "Juan Perez",
            "employee_role": "Operario",
            "boss_name": "Jefa",
            "boss_email": "jefa@empresa.cl",
            "alert_date": "2026-11-30",
            "alert_date_fmt": "30-11-2026",
            "alert_type": "PLAZO_FIJO",
            "alert_reason": "Vencimiento de contrato",
            "response_token": TOKEN_VIEJO,
            "token_issued_at": emitido,
            "first_sent_at": emitido,
            "last_followup_at": emitido,
            "followup_count": 0,
            "response": None,
        }

    def get_pending_followups(self):
        return [dict(self.row)]

    def rotate_token(self, tracking_id):
        # Como el UPDATE real: emite el token y no abre su ventana todavía.
        self.row["response_token"] = create_response_token()
        return self.row["response_token"]

    def mark_followup_sent(self, tracking_id):
        self.row["token_issued_at"] = datetime.now(timezone.utc)
        self.row["followup_count"] += 1

    def get_by_token(self, token):
        return self.row if token == self.row["response_token"] else None

    def log_event(self, **kw):
        pass


def escenario(envio_ok=True):
    """Pendiente contactado hace más de TOKEN_TTL_HORAS: el caso que reventó."""
    vencido = datetime.now(timezone.utc) - timedelta(hours=TOKEN_TTL_HORAS + 1)
    svc = ContractAlertsService.__new__(ContractAlertsService)
    svc.tracking = FakeTracking(vencido)

    correos = []
    original_send, original_url = mod._send_email_graph, settings.PUBLIC_URL
    mod._send_email_graph = lambda para, cc, asunto, html: (correos.append(html), envio_ok)[1]
    settings.PUBLIC_URL = "https://personas.example.cl"
    try:
        resultado = svc.send_followup_emails()
    finally:
        mod._send_email_graph, settings.PUBLIC_URL = original_send, original_url
    return svc, resultado, correos


def token_del_correo(html):
    encontrados = re.findall(r"respond\?token=([^\"'&\s]+)", html)
    assert len(encontrados) == 1, f"links en el correo: {len(encontrados)}"
    return encontrados[0]


def test_recordatorio_emite_token_nuevo():
    svc, resultado, correos = escenario()
    assert resultado == {"sent": 1, "errors": 0}
    enviado = token_del_correo(correos[0])
    assert enviado != TOKEN_VIEJO
    assert TOKEN_VIEJO not in correos[0]
    # El viejo deja de resolver: el link que ya circulaba muere acá.
    assert svc.tracking.get_by_token(TOKEN_VIEJO) is None


def test_el_link_del_recordatorio_abre():
    """Lo que fallaba: el token viajaba vencido y la página decía Link inválido."""
    svc, _, correos = escenario()
    assert svc._lookup_token(token_del_correo(correos[0])) is not None
    assert svc.preview_respond(token_del_correo(correos[0]))["ok"] is True


def test_el_recordatorio_vuelve_a_salir_manana():
    """La cadencia no se toca: el envío no mueve last_followup_at.

    get_pending_followups() mide (CURRENT_DATE - last_followup_at::date) >= 3.
    Si el recordatorio avanzara esa fecha, el próximo saldría en tres días en vez
    de mañana.
    """
    svc, _, _ = escenario()
    assert svc.tracking.row["last_followup_at"] == svc.tracking.ancla_inicial
    assert svc.tracking.get_pending_followups()  # mañana vuelve a estar en la lista


def test_envio_fallido_no_abre_la_ventana():
    """Si Graph falla, el token emitido no estrena sus 72 horas: nadie lo recibió."""
    svc, resultado, _ = escenario(envio_ok=False)
    assert resultado == {"sent": 0, "errors": 1}
    emitido = svc.tracking.row["token_issued_at"]
    assert datetime.now(timezone.utc) - emitido > timedelta(hours=TOKEN_TTL_HORAS)
    assert svc.tracking.row["followup_count"] == 0


if __name__ == "__main__":
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_"):
            fn()
            print(f"ok {nombre}")
    print("todo ok")
