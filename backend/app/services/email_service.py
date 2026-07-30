"""Envío de correos vía Microsoft Graph (delegado, me/sendMail).

Helper compartido por contract_alerts, retorno y horas extras.
"""

from app.core.logging_config import logger


def send_email_graph(to: str, cc: str, subject: str, html_body: str, bcc: str = "") -> bool:
    """Envía un email vía Microsoft Graph API usando el refresh token almacenado.
    cc/bcc son strings separados por ';'.
    Lanza AuthRequiredError si no hay sesión activa."""
    import httpx
    from app.services.email_token_service import get_access_token, AuthRequiredError  # noqa: F401

    access_token = get_access_token()  # puede lanzar AuthRequiredError

    cc_recipients = [
        {"emailAddress": {"address": addr.strip()}}
        for addr in cc.split(";")
        if addr.strip()
    ]
    bcc_recipients = [
        {"emailAddress": {"address": addr.strip()}}
        for addr in bcc.split(";")
        if addr.strip()
    ]

    try:
        resp = httpx.post(
            "https://graph.microsoft.com/v1.0/me/sendMail",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "message": {
                    "subject": subject,
                    "body": {"contentType": "HTML", "content": html_body},
                    "toRecipients": [{"emailAddress": {"address": to}}],
                    "ccRecipients": cc_recipients,
                    "bccRecipients": bcc_recipients,
                }
            },
            timeout=20,
        )
        resp.raise_for_status()
        logger.info(f"Email enviado exitosamente a {to}")
        return True
    except Exception as e:
        logger.error(f"Error enviando email a {to}: {e}")
        return False
