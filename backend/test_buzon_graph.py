"""Verifica si un buzón existe y es resoluble por Graph.

    python test_buzon_graph.py notificacionespersonas@cramer.cl

404 -> no es usuario del tenant, o es un alias SMTP secundario (usar el UPN real).
403 -> existe, pero falta Mail.Send.Shared / SendAs.
200 -> revisa 'userPrincipalName': ese es el valor que va en SALIDA_PERSONAL_FROM.
"""

import sys

import httpx

from app.services.email_token_service import get_access_token

buzon = sys.argv[1] if len(sys.argv) > 1 else "notificacionespersonas@cramer.cl"

resp = httpx.get(
    f"https://graph.microsoft.com/v1.0/users/{buzon}",
    params={"$select": "id,userPrincipalName,mail,proxyAddresses"},
    headers={"Authorization": f"Bearer {get_access_token()}"},
    timeout=20,
)
print(resp.status_code)
print(resp.text)
