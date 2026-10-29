# Módulo: Compensaciones

Benchmark de mercado (Mercer TRS) para un cargo que escribe el usuario. Los datos
viven en el schema `compensaciones` de `rh_cramer` (ver `docs/superpowers/specs/2026-10-17-compensaciones-design.md`).

## Flujo

```
GET  /api/v1/compensaciones/permisos                    -> {admin}: si el usuario es admin del módulo
GET  /api/v1/compensaciones/estudios                    -> estudios de los países del usuario (país, moneda, factor mensual)
POST /api/v1/compensaciones/match                       -> embedding + scoring GPT -> top 5 cargos Mercer
GET  /api/v1/compensaciones/niveles?estudio_id&cargos=  -> niveles comunes con datos (COMP1.promedio)
POST /api/v1/compensaciones/resultado                   -> COMP1 y COMP3_REAL de los cargos en el nivel
POST /api/v1/compensaciones/analisis                    -> guarda el análisis (botón "Guardar análisis")
GET  /api/v1/compensaciones/analisis?estudio_id         -> historial: los propios; el admin ve todos
DELETE /api/v1/compensaciones/analisis/{id}            -> borra un análisis: los propios; el admin cualquiera (404 si no)
GET  /api/v1/compensaciones/cargos-empresa?estudio_id     -> cargos del país del estudio + homologación vigente
```

`POST /analisis` acepta `cargo_empresa_id` (homologación): solo admin (403) y el cargo debe ser del país del estudio (400).
Vigente = el último análisis por (estudio, cargo). `compensaciones.cargo_empresa` la llena n8n desde Snowflake (upsert, no borra).
El descriptor que va al match es `description` + los 10 primeros títulos CBO del cargo (solo BR: `code` = código CBO, tabla `compensaciones.cbo`, migración 035).

## Acceso

Se maneja en la tabla `compensaciones.acceso` (migración 036), una fila por username:
`admin = true` ve todos los países, homologa, usa la cola masiva y ve el historial
de todos; `admin = false` ve solo los países de `paises`. Sin fila no ve estudios.
Un estudio de otro país responde 404. Los cambios rigen sin reiniciar.

Solo `POST /analisis` y `DELETE /analisis/{id}` escriben en BD: probar cargos y niveles no deja registros.
Al abrir un análisis del historial el resultado se recalcula con el estudio.

El país, la moneda y el factor mensual salen de `compensaciones.estudio`: no hay
ramas por país. Un país aparece apenas se cargan su estudio y sus vectores.

## Regla de acoplamiento

Este paquete importa de la plataforma **solo**:

| Import | Para qué |
|---|---|
| `app.core.security.require_module` | Autorización del router |
| `app.core.security.get_current_active_user` | `creado_por` del análisis y acceso |
| `app.db.deps.get_db` | Sesión SQLAlchemy contra PostgreSQL |
| `app.core.logging_config.logger` | Logs |

Borrar la carpeta y el bloque final de `app/api/v1/api.py` desinstala el módulo.

## Flag

`COMPENSACIONES_ENABLED=false` por defecto. Apagado, el paquete no se importa y
`/api/v1/compensaciones/*` no existe.

## Variables de entorno (`backend/.env`)

```
COMPENSACIONES_ENABLED=true
COMPENSACIONES_OPENAI_API_KEY=sk-...
```

Opcionales: `COMPENSACIONES_MODELO_EMBEDDING`, `_MODELO_GPT`, `_UMBRAL` (0.5),
`_CANDIDATOS` (25), `_MOSTRAR` (5), `_TIMEOUT` (30 s). El backend necesita salida
HTTPS a `api.openai.com`.

## Migración

```
psql -d rh_cramer -f backend/migrations/033_create_compensaciones_module.sql
psql -d rh_cramer -f backend/migrations/034_cargo_empresa.sql
psql -d rh_cramer -f backend/migrations/035_cbo.sql
psql -d rh_cramer -f backend/migrations/036_acceso.sql
```

Idempotente. Crea el schema si falta, deja intactos los datos y da de alta el
módulo en `app.modulos` (y `app.rol_modulos` para `admin`). Falta asignarlo a los
demás perfiles desde el panel de administración. Los estudios y vectores se cargan
con `carga_compensaciones.py`, fuera del repo.

## Decisiones

- **Sin reintentos a OpenAI.** Si falla el embedding, 502. Si falla el scoring,
  el score es similitud × 100 y la respuesta trae `fuente="coseno"`.
- **El análisis se guarda solo con el botón**: un `INSERT` con cargo, descriptor,
  candidatos mostrados, cargos elegidos y nivel. Guardar dos veces crea dos filas.
- **Un dato suprimido por Mercer es NULL**, nunca 0. El híbrido muestra un
  estadístico solo si todos los cargos elegidos lo tienen.

## Self-check

```
python -m tests.test_compensaciones
```
