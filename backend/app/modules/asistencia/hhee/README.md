# Submódulo: Horas extras (HHEE)

Alertas de horas extras aprobadas que superan el tope legal. Vive dentro de
`asistencia` porque es el mismo dominio (jornada y marcaje) y comparte su
autorización: `require_module("asistencia")` a nivel de router.

## Quién escribe y quién lee

Los datos **no** los produce la plataforma. Los escribe un servicio aparte
—contenedor `hhee-scrapping`, repo `scrapping-hhee-reportes`— que scrapea
Buk/ctrlit y hace upsert en `app.hhee_alertas`. Corre lunes a viernes 08:00
(America/Santiago) sobre la **semana ISO anterior completa**, barriendo los
recintos `36787, 42123, 42961`.

Este submódulo solo **lee esa tabla**. Es deliberado: si Buk o el scraper se
caen, la pantalla sigue mostrando el último dato conocido y `ultima_vez` dice de
cuándo es. La única salida a la red es `POST /hhee/refrescar`, y solo si alguien
aprieta el botón.

```
Buk/ctrlit ──scrape──> hhee-scrapping ──upsert──> app.hhee_alertas ──SELECT──> esta pantalla
                            ▲
                            └── POST /hhee/refrescar (botón, opcional)
```

## Topes

| Tope | Cuándo aplica |
|---|---|
| 2 h diarias | **Solo lunes a viernes** |
| 12 h semanales | Toda la semana ISO (lunes a domingo) |

Sábado y domingo no tienen tope diario: solo los acota el semanal. O sea, una
semana sin HHEE de lunes a viernes admite las 12 h completas en el fin de
semana; si hubo HHEE entre semana, al fin de semana le queda el saldo.

## Endpoints

Todos bajo `/api/v1/asistencia/hhee/`:

| Ruta | Qué hace |
|---|---|
| `GET /alertas` | Tabla de alertas (`DataResponse`, igual que Marcajes y Reportes) |
| `GET /semanas` | Semanas ISO con datos, para el selector |
| `GET /frescura` | Última corrida del scraper por recinto |
| `POST /refrescar` | Dispara el barrido ahora. ~12 s por recinto |

`GET /alertas` sin filtro de fecha devuelve la **semana ISO anterior**, que es
lo que el job acaba de procesar y lo que hay que revisar hoy.

## El filtro por semana va por anio_iso/semana_iso

`clave_periodo` guarda **dos formatos en la misma columna de texto**:
`'2026-09-02'` para las alertas diarias y `'2026-W36'` para las semanales. Como
`'W'` ordena después de cualquier dígito, un rango lexicográfico entre ambos no
acota nada: `['2026-08-31', '2026-W36']` incluye `'2026-12-25'` y `'2026-W01'`.

Por eso el filtro de semana usa las columnas `anio_iso` / `semana_iso`, que
**ambos** tipos de fila traen. `desde`/`hasta` sobre `clave_periodo` siguen
disponibles, pero exigen `tipo` (si no, 422): dentro de un mismo tipo el orden
sí es correcto. `tests/test_hhee_alertas.py` fija esta decisión.

Los filtros opcionales van con `CAST(:param AS tipo)`. Sin eso, un parámetro que
solo aparece comparado contra `NULL` no tiene tipo inferible y Postgres corta con
`AmbiguousParameter` en cualquier driver de binding server-side.

## Variables de entorno

Solo para el botón de refresco. La lectura de la tabla no necesita ninguna:

```
ASISTENCIA_HHEE_API_URL=http://hhee-scrapping:8000    # default
ASISTENCIA_HHEE_API_KEY=<la HHEE_API_KEY del scraper>
ASISTENCIA_HHEE_TIMEOUT=180                            # default: ~12 s x 3 recintos + margen
```

`ASISTENCIA_HHEE_API_KEY` tiene que ser **igual** al `HHEE_API_KEY` del
contenedor `hhee-scrapping`. Si no coinciden, el refresco vuelve con 401 y el
mensaje de error lo dice.

A diferencia de `marcas_api_key`, **no cae a `ASISTENCIA_EXTERNAL_API_KEY`**.
Ahí el fallback tiene sentido porque los dos valores son tokens de Buk Ctrl
contra el mismo host; acá `EXTERNAL_API_KEY` es el token de Buk y esta es la
`X-API-Key` de un servicio propio. Reusarla mandaría la credencial de Buk a otro
servicio y ataría el botón de refresco a su rotación.

Vacía, `POST /refrescar` responde 503 y el resto del submódulo sigue
funcionando. La key se manda **desde el backend**, nunca desde el navegador.

Red: el contenedor `hhee-scrapping` está en `dashboard-licencias_internal`. Se lo
llama por su `container_name` (`hhee-scrapping`), que es el nombre que resuelve
entre proyectos de compose distintos.

## Limitación conocida

`GET /frescura` sale de la propia tabla de alertas, así que un recinto **sin
alertas** no aparece — y es indistinguible de uno que dejó de procesarse. Para
distinguirlos habría que que el scraper registre cada corrida, no solo sus
hallazgos. Hoy eso se ve en `docker compose logs hhee`.

## Estado

- [x] Repositorio de lectura sobre `app.hhee_alertas`, con join a `rh.employees`
      para nombre, cargo y centro de costo
- [x] `GET /alertas`, `/semanas`, `/frescura`; `POST /refrescar`
- [x] Tests del filtro por semana y del 503 sin configuración
- [ ] Frontend: submódulo dentro de la vista `/asistencia`
- [ ] Estado de gestión de la alerta (reconocida / justificada): necesita columna
      nueva en la tabla y un `PATCH`
