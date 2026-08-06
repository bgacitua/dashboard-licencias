"""Diagnóstico del envío desde un buzón compartido.

    python test_buzon_graph.py notificacionespersonas@cramer.cl

1) Imprime los scopes reales del access token y el usuario autenticado.
   Si falta Mail.Send.Shared, hay que reconsentir (el refresh token guarda
   los scopes del consentimiento original, no los del código actual).
2) Intenta el sendMail y muestra el cuerpo del error de Graph, que trae el
   código interno (ErrorSendAsDenied / ResourceNotFound / MailboxNotEnabled).
"""

import base64
import json
import sys

import httpx

from app.services.email_token_service import get_access_token

buzon = sys.argv[1] if len(sys.argv) > 1 else "notificacionespersonas@cramer.cl"
token = get_access_token()

# El access token es un JWT; el payload va en el 2do segmento, base64url sin padding.
payload = token.split(".")[1]
claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
print("scopes :", claims.get("scp"))
print("cuenta :", claims.get("upn") or claims.get("preferred_username"))

resp = httpx.post(
    f"https://graph.microsoft.com/v1.0/users/{buzon}/sendMail",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "message": {
            "subject": "Prueba SendAs",
            "body": {"contentType": "Text", "content": "Prueba de envío."},
            "toRecipients": [{"emailAddress": {"address": "bgacitua@cramer.cl"}}],
        }
    },
    timeout=20,
)
print("sendMail:", resp.status_code)
print(resp.text or "(sin cuerpo, envío aceptado)")
