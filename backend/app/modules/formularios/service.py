"""Lógica del módulo: gate, consumo del token, envío del enlace y envío a n8n."""
from html import escape

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


def _correo_html(nombre: str, titulo: str, link: str, horas: int) -> str:
    """Cuerpo del correo con el enlace. Usa las plantillas de la plataforma para
    que se vea igual que el resto de los correos que manda el sistema."""
    from app.services import email_templates as T

    saludo = f"Hola <strong>{escape(nombre or '')}</strong>," if nombre else "Hola,"
    return T.email_shell(
        titulo,
        f"""
      <p style="{T.P}">{saludo}</p>
      <p style="{T.P}">Necesitamos que completes el formulario
         <strong>{escape(titulo)}</strong>.</p>
      <div style="margin:22px 0">{T.button(link, "Responder formulario")}</div>
      {T.callout(f'<strong>El enlace vence en {horas} horas.</strong> Es personal: '
                 'no lo reenvíes, porque quien lo abra responderá a tu nombre.', 'warn')}""",
    )


def enviar_formulario(
    db: Session, cfg: FormulariosSettings, formulario, rut: str, enviado_por: str
) -> dict:
    """Emite un token y manda el enlace al correo del trabajador.

    El correo se toma de rh.employees y no de lo que llegue en la petición: el
    RUT viene del navegador, y aceptar el correo junto con él permitiría
    desviar el enlace de cualquier persona a una casilla ajena.
    """
    from app.services.email_service import send_email_graph

    persona = repo.persona_activa(db, rut)
    if not persona:
        return {"ok": False, "mensaje": "El RUT no corresponde a un trabajador activo."}
    if not persona.get("email"):
        return {
            "ok": False,
            "mensaje": f"{persona['full_name']} no tiene correo registrado en la nómina.",
        }
    if not app_settings.PUBLIC_URL:
        return {"ok": False, "mensaje": "PUBLIC_URL no está configurado: no se pueden generar enlaces."}

    token = repo.crear_token_envio(
        db, formulario.id, rut, persona["email"], cfg.envio_ttl_horas, enviado_por
    )
    link = f"{app_settings.PUBLIC_URL}/formularios/f/{formulario.slug}?token={token}"

    ok = send_email_graph(
        to=persona["email"],
        cc="",
        subject=f"Formulario: {formulario.titulo}",
        html_body=_correo_html(persona["full_name"], formulario.titulo, link, cfg.envio_ttl_horas),
    )
    if not ok:
        # El token queda emitido igual: si el correo falló por Graph y no por la
        # dirección, reenviar no obliga a rehacer nada.
        logger.warning(f"[Formularios] Envío fallido a {persona['email']} (formulario {formulario.slug})")
        return {"ok": False, "mensaje": "No se pudo enviar el correo. Intenta nuevamente."}

    return {"ok": True, "mensaje": f"Enviado a {persona['email']}.", "email": persona["email"]}
