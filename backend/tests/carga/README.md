# Prueba de carga: módulo de tickets

Tres piezas:

| Script | Dónde corre | Qué mide |
|---|---|---|
| `preparar.py` | dentro del contenedor backend | Crea N usuarios de prueba, un tipo de prueba activo y sus tokens (`tokens.json`). `limpiar` borra todo eso. |
| `concurrencia.py` | dentro del contenedor backend | Carreras: 20 ediciones simultáneas, admin contra usuario, borde del plazo, costo de bcrypt. Sale con código 1 si algo falla. |
| `locustfile.py` | en tu equipo (`pip install locust`) | Latencia y errores con 50–200 trabajadores simulados en hora punta. |

Los tokens salen de `preparar` y no de `/login` porque el login tiene rate limit
por IP (20 cada 15 min) y todos los usuarios simulados salen de la misma IP.
El costo real del login lo mide `concurrencia.py` (bcrypt).

Todo lo de prueba lleva la marca `@prueba-carga.invalid` / slug `prueba-carga`,
y `limpiar` borra solo eso.

## 1. Local (sin riesgo; mide tu PC, no la VPS)

```
docker compose -f backend/tests/carga/compose.carga.yml up --build -d
docker compose -f backend/tests/carga/compose.carga.yml exec backend python -m tests.carga.preparar crear --usuarios 200 --confirmo
docker compose -f backend/tests/carga/compose.carga.yml exec backend python -m tests.carga.concurrencia --confirmo
docker compose -f backend/tests/carga/compose.carga.yml cp backend:/app/tests/carga/tokens.json ./tokens.json
TK_TOKENS=tokens.json locust -f backend/tests/carga/locustfile.py --host http://localhost:8765
docker compose -f backend/tests/carga/compose.carga.yml down -v
```

## 2. Prod (fuera de horario)

Afecta a toda la plataforma mientras dura: un solo proceso de uvicorn y 15
conexiones a Postgres para todos los módulos. Durante la prueba, el tipo
"[PRUEBA] Carga — no usar" aparece en el portal.

```
# en la VPS
docker exec -it <contenedor-backend> python -m tests.carga.preparar crear --usuarios 200 --confirmo
docker exec -it <contenedor-backend> python -m tests.carga.concurrencia --confirmo
docker cp <contenedor-backend>:/app/tests/carga/tokens.json ./tokens.json   # llevarlo a tu equipo

# en tu equipo: subir de a poco (p. ej. 10 usuarios/10 s hasta 200) y mirar p95 y fallas
TK_TOKENS=tokens.json locust -f backend/tests/carga/locustfile.py --host https://personas.cramer.cl

# al terminar, siempre
docker exec -it <contenedor-backend> python -m tests.carga.preparar limpiar --confirmo
rm tokens.json
```

`tokens.json` son credenciales del portal para usuarios de prueba (vencen en
`TICKETS_SESION_HORAS`). No va al repo (`.gitignore`) y se borra al terminar.

## Qué mirar

- **p95 de "crear" y "editar"** bajo 1 s con 200 usuarios. Por encima, la fila
  está en el pool de conexiones o en el proceso único.
- **Fallas**: un 429 significa que la simulación topó el rate limit por usuario
  (hay que ajustar el script, no el sistema). Un 500 o un timeout sí es del sistema.
- **Mientras corre, abrir otro módulo de la plataforma**: si se pone lento, la
  carga de tickets está afectando al resto.
