# Módulo: Formularios

Constructor de formularios internos y recepción de respuestas. RRHH arma el
formulario en un builder visual, busca al trabajador en la nómina y le manda el
enlace a su correo. Cada respuesta queda en Postgres y se empuja al webhook de
n8n que ese formulario tenga configurado; de ahí en adelante (SharePoint, correo
por Graph) es problema de n8n.

## Flujo

```
Panel  ->  /formularios/enviar
             GET  /api/v1/formularios/personas?q=       (nómina, autenticado)
             POST /api/v1/formularios/<id>/enviar       (RUT; el correo lo pone el backend)
                  -> token en app.form_tokens (72 h) + correo por Graph

Correo ->  /formularios/f/<slug>?token=xxx
             GET  /api/v1/formularios/publico/f/<slug>?token=  -> definición + respuesta previa
             POST /api/v1/formularios/publico/f/<slug>
                  valida el token, guarda una versión nueva en app.form_respuestas,
                  commit, y recién ahí POST al webhook de n8n
```

El builder vive en `/formularios/admin`, el gestor en `/formularios/gestor` y las
respuestas en `/formularios/respuestas`. Los tres exigen el módulo `formularios`.

## Regla de acoplamiento

Este paquete importa de la plataforma **solo**:

| Import | Para qué |
|---|---|
| `app.core.security.require_module` | Autorización del router de administración |
| `app.core.security.get_current_active_user` | Autoría del formulario |
| `app.core.rate_limit` | Freno del gate público |
| `app.db.deps.get_db` | Sesión SQLAlchemy contra PostgreSQL |
| `app.core.logging_config.logger` | Logs |
| `app.core.config.settings` | `ALERTS_N8N_CA_BUNDLE` (cert de n8n) y `PUBLIC_URL` (enlaces) |
| `app.services.email_service.send_email_graph` | Envío del enlace por correo |
| `app.services.email_templates` | Formato del correo, igual al resto del sistema |

Borrar la carpeta y el bloque final de `app/api/v1/api.py` desinstala el módulo.

## Flag

`FORMULARIOS_ENABLED=false` por defecto. Con el flag apagado el paquete no se
importa, así que la rama es segura de mergear a `main` antes de estar terminada.

## Variables de entorno

```
FORMULARIOS_ENABLED=true
FORMULARIOS_N8N_HOSTS=n8n.cramer.cl
FORMULARIOS_ENVIO_TTL_HORAS=72
```

`FORMULARIOS_N8N_HOSTS` no es opcional: la URL del webhook la escribe un admin
en el panel y el backend la llama después. Sin allowlist, el panel es un SSRF
contra cualquier host que alcance la VPS. Vacío = ningún webhook se acepta.

## Migración

```
psql -d rh_cramer -f backend/migrations/017_create_formularios_module.sql
psql -d rh_cramer -f backend/migrations/018_formularios_envio_por_correo.sql
psql -d rh_cramer -f backend/migrations/019_formularios_respuesta_editable.sql
```

La 018 agrega a `form_tokens` a qué correo se mandó el enlace y quién lo mandó.
La 019 agrega `version` a `form_respuestas` para el historial de correcciones.

Crea `app.formularios`, `app.form_tokens`, `app.form_respuestas` y siembra el
módulo `formularios` en `app.modulos` (falta asignarlo al rol correspondiente
desde el panel de administración).

## Decisiones

- **No hay gate público.** El enlace se manda al correo del trabajador, así que
  la credencial llega por un canal que solo él controla. El gate anterior pedía
  el RUT contra la nómina: el RUT chileno es semipúblico y su dígito verificador
  es calculable, así que servía para suplantar a un compañero, y su respuesta
  confirmaba desde internet si alguien trabajaba acá.
- **El token vale hasta que vence, no hasta el primer uso.** El trabajador
  puede corregir lo que envió. `used_at` pasó a ser la fecha de la primera
  respuesta (`COALESCE`, así no se pisa al editar), y lo que impide que dos
  submits simultáneos creen la misma versión es el índice único
  `(token, version)`; el perdedor reintenta con el número siguiente.
- **Cada edición es una fila nueva, no un UPDATE.** El historial ES el
  registro: la respuesta vigente es la de `version` más alta y ninguna se
  sobrescribe.
- **El panel nunca ve el token.** Las respuestas se agrupan por `md5(token)`:
  con el token a la vista, quien entre al panel podría abrir el formulario de
  otra persona y responder por ella.
- **Commit antes de n8n.** Si n8n está caído, la respuesta ya está guardada con
  `n8n_ok = false` y se reprocesa; al revés se perdería.
- **El correo del destinatario lo pone el backend.** El envío recibe solo el
  RUT; la casilla se lee de `rh.employees`. Aceptarla desde el navegador dejaría
  desviar el enlace de cualquier persona a un correo ajeno.
- **El enlace del correo dura horas, no minutos.** El token del gate vive 15
  minutos porque ahí se abre el formulario al instante; el del correo se lee
  cuando la persona revisa su bandeja.
- **Sin versionado de definiciones.** Editar un formulario publicado cambia el
  JSON para las respuestas futuras, no para las guardadas: `datos` es
  autocontenido. Si algún día se necesita auditar contra qué versión respondió
  alguien, ahí se agrega una tabla de versiones.

## Self-check

```
python -m tests.test_formularios_token
```

Cubre la allowlist del webhook y el un-solo-uso del token (esta última se salta
sola si no hay base con la migración aplicada).
