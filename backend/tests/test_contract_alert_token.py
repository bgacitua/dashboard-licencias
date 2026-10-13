"""Check del token de respuesta de alertas de contratos.

Cubre lo que importa del fix: token sin PII, caducidad y consumo único.
Usa un tracking falso en memoria; no toca la BD.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import create_response_token
from app.services.contract_alerts_service import (
    TOKEN_TTL_HORAS,
    ContractAlertsService,
)


class FakeTracking:
    def __init__(self, token, emitido):
        self.row = {
            "id": 1,
            "employee_id": 99,
            "rut": "11.111.111-1",
            "employee_name": "Juan Perez",
            "boss_name": "Jefa",
            "boss_email": "jefa@empresa.cl",
            "alert_date": "2026-11-30",
            "alert_type": "PLAZO_FIJO",
            "response_token": token,
            "first_sent_at": emitido,
            "last_followup_at": emitido,
            "response": None,
        }
        self.eventos = []

    def get_by_token(self, token):
        return self.row if token == self.row["response_token"] else None

    def log_event(self, **kw):
        self.eventos.append(kw)

    def set_response(self, token, response, responder_ip=None):
        if self.row["response"] is not None:  # equivale al WHERE response IS NULL
            return False
        self.row["response"] = response
        return True


def servicio(emitido, token="tok"):
    svc = ContractAlertsService.__new__(ContractAlertsService)
    svc.tracking = FakeTracking(token, emitido)
    svc._send_confirmation_email = lambda *a, **k: None
    return svc


def test_token_sin_pii():
    t = create_response_token()
    assert len(t) >= 40
    for otro in (create_response_token() for _ in range(5)):
        assert otro != t
    # Nada legible dentro: ni JWT (3 partes separadas por punto) ni datos.
    assert "." not in t


def test_respuesta_valida():
    svc = servicio(datetime.now(timezone.utc))
    r = svc.respond("tok", "plazo_fijo")
    assert r["ok"] and not r["already_answered"]


def test_token_caducado():
    viejo = datetime.now(timezone.utc) - timedelta(hours=TOKEN_TTL_HORAS + 1)
    assert svc_error(servicio(viejo).respond("tok", "plazo_fijo"))
    assert svc_error(servicio(viejo).preview_respond("tok"))


def test_token_desconocido():
    assert svc_error(servicio(datetime.now(timezone.utc)).respond("otro", "plazo_fijo"))


def test_consumo_unico():
    svc = servicio(datetime.now(timezone.utc))
    assert svc.respond("tok", "plazo_fijo")["ok"]
    segunda = svc.respond("tok", "no_renovar")
    assert segunda["ok"] and segunda["already_answered"]
    assert svc.tracking.row["response"] == "plazo_fijo"  # no la pisó


def test_answer_invalida():
    assert svc_error(servicio(datetime.now(timezone.utc)).respond("tok", "lo_que_sea"))


def svc_error(resultado):
    return resultado.get("ok") is False


if __name__ == "__main__":
    for nombre, fn in sorted(globals().items()):
        if nombre.startswith("test_"):
            fn()
            print(f"ok {nombre}")
    print("todo ok")
