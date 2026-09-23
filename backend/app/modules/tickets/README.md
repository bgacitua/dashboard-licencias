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
`settings.JWT_SECRET_KEY`, `app.core.rate_limit`, `get_db` y `Base`. En el
frontend: `SidebarLayout`, `getAuthHeaders` y el builder compartido.

Para separar el módulo: mover esta carpeta y `frontend/src/features/tickets/`,
copiar `components/form-builder/`, y reemplazar `require_module` del panel.
Borrar las carpetas, el bloque final de `app/api/v1/api.py` y las rutas de
`App.jsx` lo desinstala.

## Decisiones

- **Cuentas aparte.** `app.tk_usuarios`, no `app.usuarios`. El JWT del portal
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
- **Versiones, no UPDATE.** El número de ticket es `tk_tickets.id` y no cambia.
  Cada edición inserta en `tk_versiones`. `version_actual > version_vista_admin`
  marca el ticket como modificado en el panel hasta que el admin lo abre.
- **Plazo congelado.** Se calcula al crear o editar (`fecha_servicio -
  dias_anticipacion` a `hora_limite`, hora de Chile) y se guarda. Cambiar la
  regla del tipo no mueve lo ya pedido. La edición es un UPDATE condicional
  (`estado = 'pendiente' AND plazo > NOW() AND version_actual = :v`), que es lo
  que decide si el admin cambia el estado en el mismo instante.
- **Imágenes en Postgres.** `tk_archivos`, con tope de `TICKETS_ARCHIVO_MAX_MB`,
  tipo detectado por firma (PNG, JPG, GIF, WebP; SVG no) y servidas sin sesión
  por un id aleatorio de 128 bits, porque las pide un `<img>`.
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
```

Siembra el módulo `tickets` en `app.modulos`. Falta asignarlo al perfil que
atiende las solicitudes desde el panel de administración.

## Self-check

```
python -m tests.test_tickets
node frontend/src/components/form-builder/tema.test.js
node frontend/src/components/form-builder/logica.test.js
```
