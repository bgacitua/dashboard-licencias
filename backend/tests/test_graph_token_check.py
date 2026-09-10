"""Chequeo diario de la sesión de Microsoft: los tres desenlaces."""
import app.services.email_token_service as ets
from app.services import scheduler_service
from app.services.email_token_service import AuthRequiredError


def _capturar_avisos(monkeypatch) -> list:
    avisos = []
    monkeypatch.setattr(scheduler_service, "_notify_n8n", lambda payload, url=None: avisos.append(payload))
    return avisos


def test_token_vigente_no_avisa(monkeypatch):
    avisos = _capturar_avisos(monkeypatch)
    monkeypatch.setattr(ets, "get_access_token", lambda: "token-fresco")

    scheduler_service._run_graph_token_check()

    assert avisos == []


def test_token_muerto_avisa_a_n8n(monkeypatch):
    avisos = _capturar_avisos(monkeypatch)

    def muerto():
        raise AuthRequiredError("sesión expirada")

    monkeypatch.setattr(ets, "get_access_token", muerto)

    scheduler_service._run_graph_token_check()

    assert len(avisos) == 1
    # El workflow de n8n despacha por este tipo: si cambia, el aviso se pierde.
    assert avisos[0]["tipo"] == "error_auth"
    assert "re-autorizar" in avisos[0]["mensaje"].lower()


def test_microsoft_caido_no_avisa(monkeypatch):
    """Sin red no se puede afirmar que la sesión murió: avisar manda a reautorizar de más."""
    avisos = _capturar_avisos(monkeypatch)

    def sin_red():
        raise ConnectionError("no route to host")

    monkeypatch.setattr(ets, "get_access_token", sin_red)

    scheduler_service._run_graph_token_check()  # no propaga: el job no debe morir

    assert avisos == []


def test_el_job_se_registra_con_solo_este_flag(monkeypatch):
    """El guard de start_scheduler apagaba el scheduler completo si los demás
    flags estaban en False, y el job nunca corría."""
    from app.core.config import settings

    for flag in ("ALERTS_SCHEDULER_ENABLED", "OVERTIME_SCHEDULER_ENABLED",
                 "LIQUIDOS_SCHEDULER_ENABLED", "RETORNO_SCHEDULER_ENABLED"):
        monkeypatch.setattr(settings, flag, False)
    monkeypatch.setattr(settings, "GRAPH_TOKEN_CHECK_ENABLED", True)

    scheduler_service.start_scheduler()
    try:
        job = scheduler_service._scheduler.get_job("graph_token_check_job")
        assert job is not None
    finally:
        scheduler_service.stop_scheduler()
