# Módulo: Tickets

Portal donde los trabajadores piden desayunos, almuerzos o lo que el admin
defina, y panel donde se atienden. Cada tipo de solicitud es un formulario de
survey-core que el admin arma en el builder compartido
(`frontend/src/components/form-builder/`), con imágenes y apariencia propia.

## Flujo

```
Portal (/tickets)         cuenta propia del módulo, NO la de la plataforma
  /tickets/ingresar        registro (correo @cramer.cl en la nómina) + login
  /tickets                 tipos disponibles + mis solicitudes
  /tickets/nueva/:tipo     fecha del servicio + formulario
  /tickets/t/:id           ver / editar (si pendiente y en plazo) / conversar

Panel (/tickets/admin)    require_module("tickets")
  /tickets/admin           solicitudes, versiones con diff, estado, comentarios
  /tickets/admin/tipos     builder, plazo y apariencia de cada tipo
  /tickets/admin/usuarios  activar, desactivar, restablecer clave
```

## Regla de acoplamiento

Imports hacia fuera de la carpeta: `require_module`, `get_current_active_user`,
`settings.JWT_SECRET_KEY`, `PUBLIC_URL`, `ALERTS_N8N_CA_BUNDLE` y los tamaños
del pool, `app.core.rate_limit`, `logger`,
`get_db` (panel), `SessionLocal` (portal) y `Base`. En el
frontend: `SidebarLayout`, `getAuthHeaders` y el builder compartido.

Para separar el módulo: mover esta carpeta y `frontend/src/features/tickets/`,
copiar `components/form-builder/`, y reemplazar `require_module` del panel.
Borrar las carpetas, el bloque final de `app/api/v1/api.py` y las rutas de
`App.jsx` lo desinstala.

## Correos de cuentas (n8n)

El backend no manda correos: hace POST a `TICKETS_N8N_WEBHOOK_URL` (Bearer
`TICKETS_N8N_TOKEN`) y n8n los envía desde su casilla. Siempre en segundo
plano; si n8n falla, la cuenta queda igual y el error va al log.

```json
{"evento": "usuario_registrado | usuario_aprobado | usuario_rechazado",
 "para": ["..."], "usuario": {"nombre": "", "rut": "", "email": ""},
 "link": "https://…", "motivo": null}
```

- `usuario_registrado`: cuenta nueva pendiente; `para` = `TICKETS_ADMIN_EMAILS`.
- `usuario_aprobado` / `usuario_rechazado`: solo al responder una solicitud
  (`logica.aviso_de_cambio`); `para` = el usuario.

## Decisiones

- **Esquema propio.** Todo vive en `tickets.*`: `pg_dump -n tickets` se lleva el
  módulo entero. Solo la fila `tickets` de `app.modulos` queda en `app`.
- **Cuentas aparte.** `tickets.usuarios`, no `app.usuarios`. El JWT del portal
  se firma con una clave derivada de `JWT_SECRET_KEY` (`logica.clave_jwt`): un
  token del portal no pasa `get_current_user` aunque su `sub` coincida con un
  username, y viceversa.
- **Sin verificación por correo, a pedido del negocio.** La reemplazan tres
  cosas: el correo tiene que ser del dominio y estar activo en `rh.employees`,
  la cuenta nace `pendiente` hasta que un admin la activa, y rate limit en
  registro y login. El registro responde siempre lo mismo para no confirmar
  desde internet quién trabaja acá.
- **Clave olvidada.** El admin la restablece: se borra el hash y se abre una
  ventana de `TICKETS_RESET_HORAS` en que la persona vuelve a registrarse con
  el mismo correo. La cuenta conserva su estado.
- **Versiones, no UPDATE.** El número de ticket es `tickets.tickets.id` y no cambia.
  Cada edición inserta en `tickets.versiones`. `version_actual > version_vista_admin`
  marca el ticket como modificado en el panel hasta que el admin lo abre.
- **Plazo congelado.** Se calcula al crear o editar (`fecha_servicio -
  dias_anticipacion` a `hora_limite`, hora de Chile) y se guarda. Cambiar la
  regla del tipo no mueve lo ya pedido. La edición es un UPDATE condicional
  (`estado = 'pendiente' AND plazo > NOW() AND version_actual = :v`), que es lo
  que decide si el admin cambia el estado en el mismo instante.
- **Imágenes en Postgres.** `tickets.archivos`, con tope de `TICKETS_ARCHIVO_MAX_MB`,
  tipo detectado por firma (PNG, JPG, GIF, WebP; SVG no) y servidas sin sesión
  por un id aleatorio de 128 bits, porque las pide un `<img>`.
- **Cupos de base en el portal.** El portal no usa `get_db` sino `db_portal`
  (`auth.py`), que limita con un semáforo los requests simultáneos que usan la
  base al tamaño del pool. Sin eso, la prueba de carga congeló el backend 30 s:
  cada request salta varias veces por el threadpool con la conexión tomada, y
  con más de 40 simultáneos todos los hilos quedaban esperando conexión.
- **Sin `file` en el builder de tickets.** survey-core lo guardaría en base64
  dentro de cada versión.

## Variables de entorno

```
TICKETS_ENABLED=true
TICKETS_DOMINIOS=cramer.cl
TICKETS_SESION_HORAS=12
TICKETS_RESET_HORAS=24
TICKETS_ARCHIVO_MAX_MB=3
```

## Migración

```
psql -d rh_cramer -f backend/migrations/022_create_tickets_module.sql
psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/023_tickets_a_esquema_propio.sql
```

La 022 creó las tablas como `app.tk_*`; la 023 las borra (solo si están
vacías) y las crea en el esquema `tickets`.

Siembra el módulo `tickets` en `app.modulos`. Falta asignarlo al perfil que
atiende las solicitudes desde el panel de administración.

## Self-check

```
python -m tests.test_tickets
node frontend/src/components/form-builder/tema.test.js
node frontend/src/components/form-builder/logica.test.js
```
