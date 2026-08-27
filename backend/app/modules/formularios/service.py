"""Lógica del módulo: gate, consumo del token y envío a n8n."""
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.logging_config import logger

from . import repository as repo
from .config import FormulariosSettings

# Mensaje único del gate: no distingue "RUT no está en la nómina" de
# "formulario inactivo" ni de "slug inexistente". Esa diferencia sería un
# oráculo para enumerar la nómina desde afuera.
GATE_ERROR = "No pudimos validar tus datos. Revisa el RUT e inténtalo de nuevo."


def emitir_token(db: Session, cfg: FormulariosSettings, slug: str, rut: str) -> str | None:
    """Devuelve la URL del formulario con token, o None si no valida."""
    formulario = repo.get_por_slug(db, slug)
    if not formulario or not formulario.activo:
        return None
    if not repo.rut_en_nomina(db, rut):
        return None
    token = repo.crear_token(db, formulario.id, rut, cfg.token_ttl_min)
    return f"/formularios/f/{formulario.slug}?token={token}"


def enviar_a_n8n(url: str, payload: dict) -> bool:
    """POST al webhook del formulario. Devuelve si n8n lo recibió.

    Mismo manejo de certificado que app.services.scheduler_service._notify_n8n
    (n8n tiene cert self-signed y se valida contra su .pem), pero acá el
    resultado se guarda en form_respuestas.n8n_ok para poder reprocesar.
    """
    if not url:
        return False
    try:
        import httpx

        verify = app_settings.ALERTS_N8N_CA_BUNDLE or True
        resp = httpx.post(url, json=payload, timeout=10, verify=verify)
        return resp.status_code < 400
    except Exception as e:
        logger.warning(f"[Formularios] No se pudo notificar a n8n: {e}")
        return False


def registrar_respuesta(
    db: Session, formulario, token: str, datos: dict, ip: str | None
) -> int | None:
    """Consume el token, guarda la respuesta y la empuja a n8n.

    Devuelve el id de la respuesta, o None si el token no era usable.
    """
    rut = repo.consumir_token(db, token, formulario.id)
    if rut is None:
        return None

    respuesta = repo.guardar_respuesta(db, formulario.id, token, rut, datos, ip)
    # Commit antes de llamar a n8n: si n8n está caído la respuesta ya está
    # guardada y se reprocesa desde n8n_ok = false. Al revés se perdería.
    db.commit()
    db.refresh(respuesta)

    ok = enviar_a_n8n(
        formulario.n8n_webhook_url or "",
        {
            "tipo": "formulario_respuesta",
            "slug": formulario.slug,
            "titulo": formulario.titulo,
            "rut": rut,
            "respuesta_id": respuesta.id,
            "datos": datos,
        },
    )
    repo.marcar_n8n(db, respuesta.id, ok)
    return respuesta.id
