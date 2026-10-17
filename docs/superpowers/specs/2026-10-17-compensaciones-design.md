# Plan — Módulo Compensaciones v1 (match de mercado · CL · PE · BR)

Fecha: 2026-10-17 · Base: `origin/main` 2f124a1 (dashboard-licencias / personas-cramer) · Rama de trabajo: `modulo_compensaciones`
Referencias: `CONTEXTO_DATOS.md`, `claude/levantamiento_arquitectura.md`, `claude/prompt_desarrollo_compensaciones_v1.md`.

## Alcance

**v1:** el usuario escribe un cargo (título + descriptor), elige el o los cargos Mercer equivalentes, elige el nivel y ve el mercado. Para el cargo, el híbrido y su subfamilia se muestran sueldo base (COMP1) y compensación total (COMP3_REAL) con p25 / mediana / promedio / p75. Cada consulta queda guardada en `compensaciones.analisis`.

**Fuera de v1:**
- Dotación y cargos BUK (fase 2).
- Costo anual proyectado (más adelante, vía calculadora).
- Conversión de moneda o comparación entre países.
- Carga de estudios desde la UI: sigue con `carga_compensaciones.py`.

## Decisiones (2026-10-17)

1. **Cargo propio = texto libre** (título + descriptor opcional). v1 no lee BUK.
2. **El país sale del dato, no del código.** País, moneda y factor mensual vienen de `compensaciones.estudio`. El backend no tiene ramas por país; solo usa un nombre para el prompt (`{"CL": "Chile", "PE": "Perú", "BR": "Brasil"}`). Un país aparece en el módulo apenas se cargan su estudio y sus vectores, sin deploy.
3. **Se prueba Chile primero.** Perú todavía no está cargado. Brasil no tiene nómina en rh_cramer, y Gabriel confirma su estudio más adelante.
4. **Fase 2:** el compa-ratio y el cuartil se calculan contra la mediana. Si Mercer la suprimió, se usa el promedio y se marca en pantalla.
5. **Módulo autocontenido** `app/modules/compensaciones/` con flag `COMPENSACIONES_ENABLED=false`, igual que formularios y tickets.
6. **OpenAI desde el servidor con `httpx`**, que ya está en requirements; no se agrega el SDK `openai`.
7. **Reglas de datos sin cambios** (CONTEXTO_DATOS):
   - la unidad del match es el cargo;
   - la subfamilia es el core job y se lee, no se calcula;
   - un dato suprimido es NULL ("s/d");
   - solo se ofrecen niveles comunes;
   - mensual = anual ÷ `factor_mensual`.
8. **Híbrido (confirmado):** es el promedio simple de los cargos elegidos en el mismo nivel. Cada estadístico se muestra solo si todos los cargos lo tienen; si no, queda "s/d".

## Multi-país

| | Chile | Perú | Brasil |
|---|---|---|---|
| Estudio | 2025 CL TRS (cargado) | aún no (se prueba Chile primero) | por llegar (MATCH `paises/br` listo, columnas sin confirmar) |
| Moneda · locale | CLP · es-CL | PEN · es-PE | BRL · pt-BR |
| `factor_mensual` | 12 | 14 | Gabriel lo confirma (Mercer Brasil suele usar ×13,33) |
| Vectores | 4.025 | 2.438 (MATCH) | pendiente |
| Idioma del catálogo | es | es | pt (ver nota) |

Nota sobre Brasil: el scoring GPT tolera una consulta en español contra un catálogo en portugués, pero el umbral 0,5 de coseno hay que validarlo con datos reales. Queda configurable por env.

Pasos fuera del repo cuando llegue cada país:
- **Perú:** correr `estudio` + `vectores` con `carga_compensaciones.py`.
- **Brasil:**
  - agregar `PAISES["BR"] = ("BRL", factor)` en `carga_compensaciones.py` (1 línea);
  - confirmar las columnas de `paises/br/pais.py` en MATCH;
  - generar los vectores.

Frontend:
- Selector Chile / Perú / Brasil, el mismo control de Costos.
- Si el país no tiene estudio, se muestra "Sin estudio de mercado cargado".
- Si hay más de un año, aparece un selector de estudio (por defecto, el más reciente).
- Formato de montos con `Intl.NumberFormat(locale, { currency: estudio.moneda })`.

## Flujo

1. **Match.** Estudio + título + descriptor → `POST /match`.
   - Devuelve el top 5 con score, justificación, título típico y descriptor Mercer, y crea el análisis.
   - El usuario elige 1 o más cargos (híbrido).
2. **Nivel.** `GET /niveles` devuelve solo los niveles comunes con `COMP1.promedio`. Si no hay ninguno, se avisa.
3. **Resultado.** `POST /analisis/{id}/resultado` guarda la elección y devuelve dos tablas (COMP1 y COMP3_REAL):
   - filas: cada cargo, el híbrido (si hay más de un cargo) y la o las subfamilias (core);
   - columnas: N° de compañías, P25, Mediana, Promedio, P75;
   - un dato NULL se muestra como "s/d";
   - toggle anual/mensual.

## Backend — `backend/app/modules/compensaciones/`

| Archivo | Responsabilidad |
|---|---|
| `config.py` | `CompensacionesSettings`, prefijo `COMPENSACIONES_`. Campos: `enabled=False`, `openai_api_key: SecretStr`, `modelo_embedding="text-embedding-3-small"`, `modelo_gpt="gpt-4o-mini"`, `umbral=0.5`, `candidatos=25`, `mostrar=5`. |
| `ia.py` | `embedding(texto)` y `puntuar(cargo, candidatos, pais)` con httpx contra api.openai.com. Prompt y parámetros iguales a MATCH. Si el scoring falla, devuelve `None`. |
| `repository.py` | Las 5 consultas de CONTEXTO_DATOS + `get_estudio`. Todo con `text()` y binds. |
| `service.py` | **match:** embedding → candidatos → scoring (si falla: coseno×100 con `fuente="coseno"`) → top 5 → `INSERT` del análisis.<br>**resultado:** valida, hace `UPDATE` de la elección y arma detalle + híbrido. |
| `schemas.py` | `Estudio`, `MatchIn`, `Candidato`, `MatchOut`, `Nivel`, `ResultadoIn`, `FilaMercado`, `ResultadoOut` |
| `router.py` | `APIRouter(dependencies=[Depends(require_module("compensaciones"))])` con 4 endpoints |
| `README.md` | Flujo, regla de acoplamiento, flag, variables de entorno y migración |

Endpoints `/api/v1/compensaciones`:

| Endpoint | Entrada → salida |
|---|---|
| `GET /estudios` | lista de estudios |
| `POST /match` | `{estudio_id, cargo_nombre, descriptor?}` → `{analisis_id, fuente, candidatos[≤5]}` |
| `GET /niveles?estudio_id=&cargos=…` | niveles comunes |
| `POST /analisis/{id}/resultado` | `{cargos[], nivel}` → `{moneda, factor_mensual, filas[]}` |

- **Migración `033_create_compensaciones_module.sql`:** el DDL de `schema_compensaciones.sql` hecho idempotente, más `app.modulos` y `app.rol_modulos` para admin.
- **Test `backend/tests/test_compensaciones.py`:** self-check sin BD.

## Frontend — `frontend/src/features/compensaciones/`

| Archivo | Contenido |
|---|---|
| `pages/Compensaciones.jsx` | La página del módulo |
| `components/PasoMatch.jsx`, `PasoNivel.jsx`, `PasoResultado.jsx` | Un componente por paso |
| `services/compensaciones.js` | Las llamadas a la API |

- **Integración:** ruta lazy en `App.jsx`, ítem en `Sidebar.jsx` y card en `MainMenu.jsx`.
- **Estilos:** tokens `app-*` de Tailwind. Sin CSS propio ni gráficos.

## Entregas

1. **Rama `modulo_compensaciones`**, ya creada desde main. Trae archivos sin trackear de un prototipo `match` que no se commitean.
2. **Desarrollo en otra ventana**, con `claude/prompt_desarrollo_compensaciones_v1.md`, en este orden:
   - migración;
   - backend + test;
   - frontend;
   - spec en `docs/superpowers/specs/2026-10-17-compensaciones-design.md`.
3. **Prueba contra la BD (Chile)**, solo con OK de Gabriel, porque la BD de desarrollo es la de producción:
   - correr la 033;
   - en `.env`: `COMPENSACIONES_ENABLED=true` + `COMPENSACIONES_OPENAI_API_KEY`;
   - salida HTTPS a api.openai.com;
   - asignar el módulo a los perfiles.
4. **Perú y Brasil:** cargar el estudio y los vectores; el módulo los muestra sin deploy.

## Fase 2 (diseño previo; no se construye ahora)

- **Vista `compensaciones.v_dotacion`** (`pais`, `documento`, `nombre`, `cargo`, `base_wage`):
  - `UNION ALL` de `rh.employees` (CL, activos) y `rh_peru.employees` (PE, activos, sin los documentos 00000000/11111111);
  - la rama de BR se agrega cuando exista la nómina;
  - el filtro es `pais = :pais`.
- **Vínculo cargo BUK ↔ cargo Mercer:** por `cargo_codigo`.
- **Posición relativa:**
  - compa-ratio = `base_wage ÷ (mediana COMP1 ÷ factor)`, con respaldo en el promedio (marcado);
  - cuartil.
- **Por definir:** quién ve los sueldos individuales y quién solo los agregados.

## Pendientes

- `factor_mensual` de Brasil (Gabriel).
- `trs`: confirmar que ya se borró de rh_cramer.
- Prototipo `match` sin trackear en la rama: decidir si se borra.
