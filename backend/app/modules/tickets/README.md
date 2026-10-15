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
  /tickets/nueva/:tipo     reserva de sala + horario del servicio + formulario
  /tickets/t/:id           ver / pedir cambio (si abierta y en plazo) /
                           cancelar (si abierta) / seguir el recorrido

Panel (/tickets/admin)    require_module("tickets")
  /tickets/admin           solicitudes, versiones con diff, estado, seguimiento
  /tickets/admin/tipos     builder, plazo y apariencia de cada tipo
  /tickets/admin/usuarios  activar, desactivar, restablecer clave
```

## Estados de una solicitud

```
pendiente ──(el admin la toma)──> en_curso ──(pasa el día)──> cerrado
    │                                 │
    └────(el usuario modifica)───> en_revision ──(resuelta)──> en_curso
    │                                 │
    └─────────────────────────────────┴──> cancelado (el usuario se baja)
                                      └──> rechazado (el admin, con motivo)
```

- **El panel pone cuatro.** `pendiente`, `en_curso`, `rechazado` y `cerrado`
  (`logica.ESTADOS_ADMIN`). Los otros dos no son botones suyos: `cancelado` es
  del usuario final y `en_revision` la mueve el flujo de cambios. El schema lo
  limita y `service.cambiar_estado` lo vuelve a decir, porque al service
  también se entra desde el job.
- **`en_revision` la enciende la solicitud de cambio.** Hasta ahora la
  propuesta pendiente vivía solo en `tickets.versiones` y el estado no decía
  nada: en el panel había que abrir el ticket para enterarse. Al resolverla
  —apruebe o rechace— la solicitud queda `en_curso`, no vuelve a la cola de
  pendientes: el administrador ya la tomó. Mientras el cambio espera, el estado
  no se puede mover a otro estado abierto; primero se resuelve.
- **Se puede pedir un cambio también en curso.** Antes solo estando
  `pendiente`. Que el administrador la haya tomado no cierra la puerta, porque
  lo que el usuario manda es una propuesta y es él quien la resuelve. El plazo
  del tipo sigue mandando.
- **`cancelado` y `rechazado` no son lo mismo.** Se bajó el solicitante o lo
  bajó el administrador. En el reporte no da igual, así que son dos estados y
  no uno con un matiz en el historial. Una solicitud cancelada no se reabre
  desde el panel: reabrirla sería decidir por el usuario, y pedir de nuevo es
  crear otra.
- **Cancelar no tiene plazo.** Mientras la solicitud siga abierta
  (`logica.ESTADOS_ABIERTOS`), el botón está. Si quedaba menos de
  `TICKETS_CANCELACION_HORAS` para el inicio del servicio, el ticket queda
  marcado en `cancelacion_tardia` porque el casino lo cobra igual. **La
  política no es pública para el usuario final**: el portal no la nombra y
  `_resumen` saca el campo de todo lo que no sea el panel. Donde sí aparece es
  en el detalle, en la tabla y en la columna "Cancelación tardía" del Excel,
  que es donde se decide qué se cobra. Vacía en lo que no se canceló: un "No"
  ahí diría que canceló a tiempo.
- **El cierre es automático al día siguiente.** Un barrido diario
  (`cierre.py`, a `TICKETS_CIERRE_HORA`) cierra todo lo que siga abierto con la
  fecha de servicio ya pasada. Un día después y no el mismo día: mientras el
  día corre, el servicio todavía puede estar ocurriendo. Cerrar a mano antes
  sigue siendo lo normal; esto es la red para que el panel no acumule
  pendientes de hace semanas. Lo cancelado y lo rechazado no se tocan.

## Regla de acoplamiento

Imports hacia fuera de la carpeta: `require_module`, `get_current_active_user`,
`settings.JWT_SECRET_KEY`, `PUBLIC_URL`, `ALERTS_N8N_CA_BUNDLE`,
`AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` (calendario) y los tamaños
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
{"evento": "usuario_registrado | usuario_aprobado | usuario_rechazado | ticket_estado | ticket_cancelado",
 "para": ["..."], "usuario": {"nombre": "", "rut": "", "email": ""},
 "link": "https://…", "motivo": null, "ticket": null}
```

- `usuario_registrado`: cuenta nueva pendiente; `para` = `TICKETS_ADMIN_EMAILS`.
- `usuario_aprobado` / `usuario_rechazado`: solo al responder una solicitud
  (`logica.aviso_de_cambio`); `para` = el usuario.
- `ticket_estado`: el admin pasa un ticket a en curso, rechazado o cerrado;
  `para` = quien lo pidió. Trae `ticket` = `{id, tipo, fecha_servicio, estado,
  comentario}`. Volver a pendiente no avisa.
- `ticket_cancelado`: el usuario final se bajó de su solicitud; `para` =
  `TICKETS_ADMIN_EMAILS`, porque el que tiene que enterarse —y a tiempo, para
  no preparar el servicio— es quien atiende. Trae `motivo` dentro de `ticket`
  y `cancelacion_tardia`, que es lo que le dice al administrador si esto se
  cobra igual. Al usuario no se le manda nada: canceló él.

## Reservas de sala (Outlook)

El usuario no escribe la fecha: elige una de sus reservas de sala, leídas del
calendario con Microsoft Graph (`calendario.py`). De la reserva salen la fecha
y el bloque horario del servicio.

- **Permiso de aplicación.** `Calendars.Read.All` sobre la app de Azure de la
  plataforma, con `client_credentials` y el token cacheado en memoria. Es otro
  token que el de los correos (`app/services/email_token_service.py`), que es
  delegado y solo trae `Mail.Send`. Comparte las credenciales `AZURE_*`.
- **Qué cuenta como reserva de sala.** El evento tiene una `locations` de tipo
  `conferenceRoom`, y de ahí sale el nombre de la sala. Es la única señal que
  se mira: el texto libre de `location` lo trae también una reunión de Teams, y
  el buzón de la sala entre los invitados no agrega nada, porque al reservar de
  verdad Graph la promueve a `locations`. Una reunión sin sala no sirve como
  bloque y no se ofrece; una que cruza la medianoche tampoco, porque no define
  a qué día pertenece el servicio.
- **Un horario, un servicio.** El mismo usuario no puede pedir dos servicios
  que se pisen el mismo día en la misma sala: pedido el almuerzo de 12:00 a
  13:00 en la Sala 1, en esa reserva de 10:00 a 13:00 solo le queda 10:00 a
  12:00, y el error se lo dice así, con el hueco libre y no solo con el choque.
  La llave es la **sala**, no la reserva: dos reuniones distintas en la misma
  sala son el mismo espacio. Tocarse en el borde no es pisarse (12:00 cierra
  uno y abre el otro). Un ticket rechazado o cancelado libera su tramo;
  pendiente, en curso, en revisión y cerrado lo ocupan —el que está en revisión
  porque lo que rige mientras tanto es su versión vigente—. Las propuestas de cambio sin aprobar no bloquean: todavía
  no rigen. Es por usuario y no por sala, porque quien reservó es quien recibe
  el servicio. Reglas puras en `logica.py` (`se_solapan`, `huecos_libres`,
  `disponibilidad_del_bloque`), aplicadas en `service.py` al crear y al pedir un
  cambio. Editando un ticket, su propio tramo no se cuenta: el portal manda su
  id en `excluir_ticket` al pedir `/reservas` y el backend lo descuenta antes de
  armar `libres`. Antes lo compensaba el navegador: la regla quedaba escrita en
  dos lados, y como el backend devuelve el tramo propio fundido con el hueco de
  al lado, el aviso de choque terminaba ofreciendo dos veces el mismo rango. El
  id se valida contra el dueño: uno ajeno responde 404, igual que el detalle.
- **El servicio va dentro de la reserva.** Elegida la reunión, el usuario dice
  desde y hasta qué hora necesita el servicio (`servicio_inicio` /
  `servicio_fin`), que puede ser más corto que el bloque: café a las 15:30 en
  una reserva de 15:00 a 17:00. El navegador acota el reloj con `min`/`max`,
  pero quien decide es el backend, y además hay un CHECK en la tabla.
  Sin reservaciones no se muestra el formulario: la página queda en el aviso
  de que hay que reservar primero.
- **Al enviar no se navega.** La página se queda mostrando el carrusel de
  noticias (`frontend/src/features/tickets/noticias.js`), el resumen de lo
  pedido y un botón al inicio. Antes se saltaba al ticket recién creado y el
  acuse se veía menos de un segundo. El mensaje final por tipo
  (`completedHtml`) ya no se configura: el carrusel lo reemplazó.
- **El seguimiento no se conversa por ningún lado.** `Seguimiento` dibuja el
  recorrido de la solicitud como línea de tiempo —lo ocurrido con su fecha y
  autor, lo que falta en gris— y no tiene dónde escribir, a ninguno de los dos
  lados. No hay endpoint de comentarios ni en el portal ni en el panel: la
  regla está en el backend y no solo en la pantalla. Lo que el usuario tenga
  que decir va en una solicitud de cambio; lo que diga el administrador, en el
  comentario con que mueve el estado, que es lo que sale por correo y lo que
  queda en la línea de tiempo. `service.anotar` es para las notas que el
  backend escribe solo (resolver un cambio, abrir un plazo de emergencia), no
  una puerta para volver a conversar.
- **Dos puertas.** Las tarjetas del inicio son para pedir algo nuevo —y avisan
  si ya hay una solicitud en curso de ese tipo antes de crear otra—; el
  historial es para revisar lo pedido y mandar solicitudes de modificación.
- **Dos pasos en una página.** Primero reservación y horario, después el
  formulario, con un rótulo arriba que dice en cuál se está. No son dos rutas:
  la reservación elegida vive en el estado, y una URL aparte la perdería en
  cada recarga. Un ticket ya enviado abre directo en su formulario.
- **La reserva se copia, no se referencia.** Fecha, horario, sala y asunto
  quedan escritos en `tickets.tickets` y en cada versión. Mover la reunión en
  Outlook después no mueve lo ya pedido, igual que el plazo congelado.
  `reserva_id` queda solo para rastrear de qué evento salió.
- **Se revalida al guardar.** El navegador manda el id y nada más: la fecha y
  el bloque los relee el backend de Graph al crear o al proponer un cambio,
  dentro de la misma ventana (`TICKETS_RESERVAS_DIAS`) que muestra el portal.
- **Si Graph se cae.** El portal responde 503 con un mensaje propio y no se
  puede pedir nada nuevo. Los tickets ya ingresados se siguen viendo y
  atendiendo: el panel lee lo guardado, no el calendario.
- **Tickets anteriores.** Las columnas van NULL: los que se pidieron antes de
  la integración no tienen bloque y se muestran solo con su fecha.

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
  regla del tipo no mueve lo ya pedido. Pedir un cambio exige solicitud abierta
  y editable (`logica.editable`: pendiente o en curso, dentro de plazo y sin
  otra propuesta esperando) más `version_actual = :v`, que es lo que decide si
  el admin toca el ticket en el mismo instante.
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
TICKETS_RESERVAS_DIAS=30
TICKETS_CANCELACION_HORAS=24
TICKETS_CIERRE_HORA=3
TICKETS_CIERRE_MINUTO=0
```

## Migración

```
psql -d rh_cramer -f backend/migrations/022_create_tickets_module.sql
psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/023_tickets_a_esquema_propio.sql
# ... y en orden hasta la última:
psql -d rh_cramer -v ON_ERROR_STOP=1 -f backend/migrations/031_tickets_estados_de_la_solicitud.sql
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
