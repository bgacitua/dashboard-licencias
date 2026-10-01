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

`ASISTENCIA_DRY_RUN=true` (por defecto) también corta el envío de correos: los
avisos a jefatura se crean igual y devuelven su formulario, pero nada sale por
Graph. Sirve para revisar el contenido sin escribirle a nadie ni necesitar la
sesión de Microsoft.

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

El filtro de recinto usa la API core de Buk con las credenciales que la
plataforma ya tiene (`BUK_API_BASE_URL` + `BUK_API_KEY`). Solo hace falta el
mapa de códigos:

```
ASISTENCIA_RECINTO_CODES=CRAMER:36787,APP:42123
```

`ASISTENCIA_BUK_API_URL` y `ASISTENCIA_BUK_API_KEY` quedan como override, para
apuntar a otra empresa o a otro token sin tocar el resto de la plataforma.

Solo para registrar marcas (la única escritura). Sin `RECINTO_KEYS` el registro
corta en 400 antes de tocar la red; el resto del módulo funciona igual:

```
ASISTENCIA_RECINTO_KEYS=36787:<clave del recinto>,36790:<clave del recinto>
ASISTENCIA_MARCAS_API_KEY=<token>          # opcional: cae al de lectura
ASISTENCIA_MARCAS_API_KEY_HEADER=token
ASISTENCIA_MARCAS_API_URL=https://app.ctrlit.cl/ctrl/api/v2/registrar
```

El link del formulario de jefatura sale de `PUBLIC_URL`, el mismo que la
plataforma usa para las alertas de contrato y las horas extras. Solo hace falta
`ASISTENCIA_PUBLIC_BASE_URL` para apuntar a otro host; vacía, hereda aquella.

Sin `ASISTENCIA_EXTERNAL_API_KEY` los endpoints devuelven 503 en vez de fallar
al arrancar: una credencial faltante no puede tumbar el resto de la plataforma.

## Ausencias en días consecutivos

Alerta de rachas: dos o más días seguidos con inasistencia sin motivo (`Motivo`
= `-`) y sin marca en Morpho en ninguno de ellos. "Seguidos" se mide sobre los
días con turno asignado, no sobre el calendario: viernes y lunes cuentan como
consecutivos si el fin de semana no había turno.

```
API Inasistencias ─> Motivo "-" ─> ¿sin marca Morpho? ─> ¿días de turno seguidos?
```

La regla vive solo en `ausencias.py`: la consumen el badge de la pestaña
Inasistencias (`GET /ausencias-consecutivas`) y el job diario que manda el
correo. `python -m app.modules.asistencia.ausencias` corre sus asserts.

El job re-avisa una racha solo si sumó días desde el último correo; el estado
vive en `app.asistencia_racha_avisada` (`docs/sql/modulo_asistencia_ausencias.sql`).
Sin casilla configurada el job no se registra.

```
ASISTENCIA_AUSENCIAS_SCHEDULER_ENABLED=true
ASISTENCIA_AUSENCIAS_EMAIL=<casilla que recibe la alerta>
ASISTENCIA_AUSENCIAS_SCHEDULER_HOUR=8
ASISTENCIA_AUSENCIAS_SCHEDULER_MINUTE=30
ASISTENCIA_AUSENCIAS_VENTANA_DIAS=14
```

`POST /ausencias-consecutivas/correr` (rol admin) dispara el job ahora, sin
esperar al horario: manda el correo de verdad y marca las rachas como avisadas,
así que la corrida automática ya no las repite.

La ventana es móvil hacia atrás: Buk hace desaparecer las inasistencias ya
justificadas, así que volver a mirar los días pasados corrige solo los avisos
que hoy ya no corresponden.

## Presencialidad

Responde una pregunta sola: **¿quiénes vinieron y no pasaron por el torniquete,
y qué días?**

    día con turno  +  sin fila en Inasistencias  +  marca en Buk  +  cero Morpho

La marca de Buk Asistencia (el mismo dataset de la pestaña Marcajes) es un
requisito, no un detalle: es lo que acredita que la persona estuvo. Cada fila de
ese dataset es una entrada registrada —no hay filas de turno sin marcar— así que
basta su existencia. Un día sin marca de ninguna clase no entra acá —eso es una
inasistencia y la persigue la otra pestaña— y los días que Buk explica
(licencia, permiso, vacaciones) quedan fuera con o sin motivo cargado.

Del lado de Morpho vale cualquier dispositivo: es el mismo `marcas_en_rango` que
usan Inasistencias y las ausencias consecutivas.

Jefe, área y recinto salen de `rh.employees` (`full_name` vía `rut_boss`,
`rh.areas.name` vía `area_id`, y `recinto_primario`) y se guardan junto al día:
el informe de un mes cerrado no cambia porque alguien cambió de jefatura
después.

### Dos grupos

Lo anterior es el grupo `turno`. El grupo `nomina` (`nomina.py`) responde la
misma pregunta para quienes **no están sujetos a marca**: gerencias y KAM, que
no tienen turno asignado ni marca en Buk y por eso el informe con turno no los
ve nunca. Ahí el universo se construye en vez de leerse:

    día hábil (lun-vie)  -  feriado  -  lo que Buk explica  =  día exigible

La nómina sale de `rh.employees` por cargo (`nomina.CARGOS`: `%Gerente%`, que
ya incluye las subgerencias, y `Key Account Manager`) y los feriados son una lista a mano por año en
`nomina.FERIADOS`. Un año sin cargar **falla**: contar un feriado como día
exigible manda a revisar a alguien que no tenía que venir. Los feriados de
elecciones se publican por ley cada ciclo y no están en la lista.

Los dos grupos comparten tabla (columna `grupo`) y forma de respuesta, no
lógica: lo que cambia es cómo se arma el día exigible.

Morpho no aguanta rangos largos, así que el mes no se calcula de una vez:

    POST /presencialidad/calcular?desde&hasta[&obra_id][&grupo]   un tramo, lo guarda
    GET  /presencialidad?desde&hasta[&obra_id][&grupo]            lee lo acumulado

`grupo` es `turno` (default) o `nomina`.

El día en curso nunca entra: a media jornada el que todavía no pasó por el
torniquete no es un caso, y entraban cientos de falsos positivos. El tramo se
recorta en `ultimo_dia_cerrado()` (ayer).

El tramo tiene tope de `sin_marca.MAX_DIAS` (31) y es idempotente: recalcular
una semana reemplaza lo guardado, así que una licencia cargada tarde se corrige
sola. Lo acumulado vive en `app.asistencia_sin_marca`
(`docs/sql/modulo_asistencia_sin_marca.sql`). La respuesta del GET trae
`cobertura`: hasta qué día alcanza lo calculado, porque un mes al que le falta
una semana se ve igual que un mes limpio.

En la UI es la pestaña "Presencialidad" dentro de Asistencia → Reportes, con una
sub-pestaña por grupo: cada una tiene su tabla y su exportable
(`reporte_presencialidad_{mes}` y `reporte_presencialidad_nomina_{mes}`).
`python -m app.modules.asistencia.sin_marca` y `... .nomina` corren sus asserts.

## Registro en la plataforma

`require_module("asistencia")` valida contra `app.modulos`. Sin esas filas todo
responde 403 aunque el flag esté encendido:

```
psql ... -f docs/sql/modulo_asistencia.sql
```

Las migraciones son manuales, no viajan con el deploy.

## Submódulos

| Carpeta | Qué es |
|---|---|
| `reportes/` | Bono de asistencia por quincena |
| `hhee/` | Alertas de horas extras sobre el tope (ver `hhee/README.md`) |

`hhee/` no scrapea nada: lee `app.hhee_alertas`, que escribe el contenedor
`hhee-scrapping` (repo `scrapping-hhee-reportes`) de lunes a viernes a las 08:00.
Si ese servicio o Buk se caen, la pantalla sigue mostrando el último dato con su
`ultima_vez`. Variables: `ASISTENCIA_HHEE_API_URL` / `_API_KEY` / `_TIMEOUT`, y
solo hacen falta para el botón de refresco.

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
- [x] `hhee/` -> alertas de horas extras sobre el tope (2 h/día de lunes a
      viernes, 12 h/semana), leídas de `app.hhee_alertas`. El scraping vive en
      otro contenedor, aislado: un Buk caído no toca la plataforma
- [x] Bonos que salen de Marcajes: especial (turno nocturno), contratista y
      colación/movilización. Se calculan en el navegador sobre las filas ya
      cargadas, con la misma metodología de ancla al jueves
