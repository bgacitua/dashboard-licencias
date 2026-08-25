# Módulo: Asistencia

Integración de `buk-asistencia` como módulo de la plataforma. El repo original
sigue existiendo por separado y no se modifica: acá se copia código, no se
mueve.

## Regla de acoplamiento

Este paquete importa de la plataforma **solo**:

| Import | Para qué |
|---|---|
| `app.core.security.require_module` | Autorización (aplicada al router entero) |
| `app.db.deps.get_db` | Sesión SQLAlchemy contra PostgreSQL |
| `app.core.logging_config.logger` | Logs |

Todo lo demás vive dentro de la carpeta. Config propia en `config.py` con
prefijo `ASISTENCIA_`. Borrar la carpeta y el bloque final de
`app/api/v1/api.py` desinstala el módulo por completo.

## Flag

`ASISTENCIA_ENABLED=false` por defecto. Con el flag apagado el paquete no se
importa siquiera, así que la rama es segura de mergear a `main` antes de estar
terminada.

## DRY_RUN

`ASISTENCIA_DRY_RUN=true` (por defecto) hace que el registro de marcas loguee
el payload en vez de escribirlo en el Buk productivo. Dejarlo en true en local:
el entorno de desarrollo apunta a los sistemas reales.

## Variables de entorno

Mínimo para que las lecturas respondan algo distinto de 503:

```
ASISTENCIA_ENABLED=true
ASISTENCIA_EXTERNAL_API_KEY=<token de Buk Ctrl>
ASISTENCIA_OBRAS=36787:Obra Las Condes,36790:Obra Vitacura
```

Opcional, para que el filtro de recinto use la API core de Buk en vez del
fallback por asignación de turnos:

```
ASISTENCIA_BUK_API_URL=https://<empresa>.buk.cl/api/v1/chile/employees/active
ASISTENCIA_BUK_API_KEY=<token>
ASISTENCIA_RECINTO_CODES=CRAMER:36787,APP:42123
```

Solo para registrar marcas (la única escritura). Sin `RECINTO_KEYS` el registro
corta en 400 antes de tocar la red; el resto del módulo funciona igual:

```
ASISTENCIA_RECINTO_KEYS=36787:<clave del recinto>,36790:<clave del recinto>
ASISTENCIA_MARCAS_API_KEY=<token>          # opcional: cae al de lectura
ASISTENCIA_MARCAS_API_KEY_HEADER=token
ASISTENCIA_MARCAS_API_URL=https://app.ctrlit.cl/ctrl/api/v2/registrar
```

Para el aviso a jefatura, la base del link del formulario. Tiene que ser
alcanzable desde fuera: lo abre alguien sin cuenta en la plataforma.

```
ASISTENCIA_PUBLIC_BASE_URL=https://personas.cramer.cl
```

Sin `ASISTENCIA_EXTERNAL_API_KEY` los endpoints devuelven 503 en vez de fallar
al arrancar: una credencial faltante no puede tumbar el resto de la plataforma.

## Registro en la plataforma

`require_module("asistencia")` valida contra `app.modulos`. Sin esas filas todo
responde 403 aunque el flag esté encendido:

```
psql ... -f docs/sql/modulo_asistencia.sql
```

Las migraciones son manuales, no viajan con el deploy.

## Estado de la migración

- [x] Esqueleto, flag, autorización, health
- [x] `shared/external_client.py` -> `client.py` (crawl paginado + caché TTL)
- [x] `shared/recintos.py` -> `recintos.py` (filtro global de recinto)
- [x] Lecturas: marcajes, auditoría, inasistencias, asignación de
      turnos, recinto por trabajador, obras
- [x] `morpho.py` -> cruce de Inasistencias, sobre el engine de MorphoManager
      que la plataforma ya tiene (`get_marcas_db`); sin `pyodbc` propio
- [x] `commands.py` -> `marcas.py`: registrar marcas respetando DRY_RUN,
      con rol admin además del módulo
- [x] Export: CSV en el cliente para las vistas, y el `.xlsx` de reportes con
      el `xlsx` que la plataforma ya traía. `excel.py`/`openpyxl` no hicieron falta
- [x] `reportes/` -> bono por quincena, sobre `get_db`; se cayeron el túnel SSH
      y las nueve variables `reportes_pg_*` / `reportes_ssh_*`
- [x] Historial: SQLite -> PostgreSQL. Guarda cada marca enviada (Buk no deja
      consultarlas) y las operaciones de corrección a medio terminar
- [x] `notificaciones.py` -> `app.services.email_service`, que ya respeta
      EMAIL_TEST_REDIRECT; se cayeron las variables GRAPH_*. Es el cuarto import
      hacia `app.*`, el único aceptado de antemano
- [x] Frontend: `pages/Asistencia.jsx` + `features/asistencia/`, ruta
      `/asistencia` y entrada de sidebar
- [x] Frontend de corrección: pestaña con tres caminos (Inasistencias, Marcas
      Fallidas, Ingreso Manual) y vista de Historial
