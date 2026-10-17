# Módulo: Compensaciones

Benchmark de mercado (Mercer TRS) para un cargo que escribe el usuario. Los datos
viven en el schema `compensaciones` de `rh_cramer` (ver `docs/superpowers/specs/2026-10-17-compensaciones-design.md`).

## Flujo

```
GET  /api/v1/compensaciones/estudios                    -> estudios cargados (país, moneda, factor mensual)
POST /api/v1/compensaciones/match                       -> embedding + scoring GPT -> top 5 cargos Mercer; guarda el análisis
GET  /api/v1/compensaciones/niveles?estudio_id&cargos=  -> niveles comunes con datos (COMP1.promedio)
POST /api/v1/compensaciones/analisis/{id}/resultado     -> guarda la elección y devuelve COMP1 y COMP3_REAL
```

El país, la moneda y el factor mensual salen de `compensaciones.estudio`: no hay
ramas por país. Un país aparece apenas se cargan su estudio y sus vectores.

## Regla de acoplamiento

Este paquete importa de la plataforma **solo**:

| Import | Para qué |
|---|---|
| `app.core.security.require_module` | Autorización del router |
| `app.core.security.get_current_active_user` | `creado_por` del análisis |
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
```

Idempotente. Crea el schema si falta, deja intactos los datos y da de alta el
módulo en `app.modulos` (y `app.rol_modulos` para `admin`). Falta asignarlo a los
demás perfiles desde el panel de administración. Los estudios y vectores se cargan
con `carga_compensaciones.py`, fuera del repo.

## Decisiones

- **Sin reintentos a OpenAI.** Si falla el embedding, 502. Si falla el scoring,
  el score es similitud × 100 y la respuesta trae `fuente="coseno"`.
- **Cada análisis queda guardado**: el `INSERT` al hacer match (con los
  candidatos mostrados) y el `UPDATE` al pedir el resultado.
- **Un dato suprimido por Mercer es NULL**, nunca 0. El híbrido muestra un
  estadístico solo si todos los cargos elegidos lo tienen.

## Self-check

```
python -m tests.test_compensaciones
```
