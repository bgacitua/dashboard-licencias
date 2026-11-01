# Diseño: pestaña "Dotación" — v1 (2026-10-30, act. 2026-11-01)

Estado: **implementado en la rama `modulo_compensaciones` (migración 038 escrita, sin correr).** Reemplaza la "Fase 2" del plan del módulo y la nota de `v_dotacion` del diseño de cargos de la empresa.

Maqueta: artifact "Maqueta Dotación Compensaciones" (https://claude.ai/artifact/Uofh1fv7gZjqz3FkVTcKxk). Usa la misma forma de datos que `GET /dotacion`. La maqueta **no** incluye el historial de sueldo (agregado después, ver abajo).

## Decisiones
- (10-30) **Gráfico principal:** dispersión **sueldo base mensual (Y) vs grado HAY (X)**, un punto por persona (desplazamiento horizontal determinístico ±0,25 para que no se tapen los del mismo grado), color por posición vs mercado: bajo P25 / entre P25 y P75 / sobre P75 / sin referencia (hueco: cargo sin homologar o Mercer sin P25/P75 para el nivel; la ficha distingue el motivo). Personas sin HAY no se grafican (se informa cuántas).
- (10-30) **Privacidad:** cualquier usuario con el país habilitado en `compensaciones.acceso` ve el detalle por persona (basta `_permitir`).
- (10-30) **Referencia de mercado:** COMP1 del **cargo homologado o híbrido** (promedio simple, regla: un estadístico solo si todos los cargos lo tienen) al nivel de la homologación, ÷ `estudio.factor_mensual`. Compa-ratio = `base_wage ÷ mediana`; si no hay mediana, `÷ promedio` y se marca.
- (11-01) **No hay jornada parcial** en la dotación: no se ajusta el sueldo.
- (11-01) **Librería del gráfico: Apache ECharts** (`echarts` + `echarts-for-react`, dependencia nueva, cargada con `React.lazy` solo en esta pestaña). Antes se usaba Plotly; Recharts no trae zoom con rueda. Zoom: `dataZoom` `inside` en ambos ejes (**rueda directa, decidido**; arrastrar mueve), `slider` en X e Y, y `toolbox.dataZoom` (lupa) + `restore`.
- (11-01) **Filtros en cascada (orden fijo, de mayor a menor alcance):** Empresa → Centro de costo → Jefatura (toda su línea) → Grado HAY (incluye "Sin HAY") → Persona (buscador). Cada filtro ofrece solo los valores que dejan los de arriba y aplica su valor a los de abajo; si un cambio arriba deja inválido un valor de abajo, se limpia. "Limpiar filtros" limpia todos y restablece el zoom. Selección única (`<select>`; Jefatura y Persona con `<input list>`).
- (11-01) **Filtrado en el navegador** sobre la lista de `/dotacion`: las opciones salen de los mismos datos y la jefatura arma el árbol con `jefe` (rut_boss / dni_boss). No se llama a los endpoints de costos (exigen el módulo costos y acoplarían módulos).
- (11-01) **Tooltip** (hover): nombre, cargo, nivel Mercer, grado HAY. **Doble clic → ficha**: foto (`url_picture`), nombre, cargo, empresa, fecha de ingreso + antigüedad (`active_since`), nivel Mercer, grado y puntos HAY, sueldo base, promedio interno del cargo (n personas), promedio de mercado del cargo, posición en mercado (chip), compa-ratio y cuartil, regla P25–mediana–P75 con la persona marcada, y **banda salarial: pendiente** (placeholder hasta definir bandas por grado; encaja como `markArea`/líneas en el mismo gráfico).
- (11-01) **Historial de sueldo y movimientos en la ficha** (vistas de Gabriel sobre `job_history`, schema `rh`, **solo Chile**; creadas a mano en la BD, **pendiente agregarlas al ETL `create.py`**):
  - `rh.vw_employees_anterior` (1 fila por persona: actual vs cambio anterior) → **"Último cambio de sueldo"** en la ficha: *anterior → actual (+x%) desde dd-mm-aaaa*. Viaja en `/dotacion` (LEFT JOIN, sin costo extra).
  - `rh.vw_job_history_cambios` (1 fila por cambio: `fecha_cambio`, `tipo_cambio`, `valor_anterior`, `valor_nuevo`, `variacion_pct`) → se carga **al abrir la ficha** (`GET /dotacion/historial`): curva de sueldo en escalones (ECharts, armada con los cambios de sueldo; no se consulta `job_history` directo), línea de tiempo de hitos (sueldo, cargo, CC, área, jefatura) e indicadores personales (crecimiento acumulado de sueldo, n° de reajustes, n° de cambios de cargo y de CC).
  - Solo desde **2022-06-01** (antes: migración a BUK con tramos solapados).
  - Atípicos (**< 0 % o > 30 %**) se marcan en la línea de tiempo, no se ocultan.
  - Perú: sin historial → la sección dice "Sin historial registrado desde junio 2022".
  - **Fuera de alcance v1:** gráfico de puntos por cargo (equidad interna), indicadores de reajuste por CC, `tipo_reajuste` (general/individual), nombre de jefatura en el cambio y `vw_compensacion_por_cargo` (bandas internas). Quedan como propuesta para una v2.

## Factibilidad (revisada 2026-11-01)
| Requisito | Fuente | Estado |
|---|---|---|
| Empresa | `areas.first_level_name` | OK (igual que costos) |
| Centro de costo | `COALESCE(e.cost_center, a.cost_center)` | OK (igual que costos) |
| Jefatura | CL `rut_boss`, PE `dni_boss` | OK (árbol en el navegador) |
| Grado HAY / persona | `v_hay_vigente`, `full_name` | OK |
| Fecha de ingreso | `active_since` | OK en CL y PE |
| Foto | `picture_url` (expuesta como `url_picture` en `v_dotacion`) | URL de S3 de BUK; si falla, iniciales |
| Cargo empresa / HAY / mercado | `role_id` → `cargo_empresa` → homologación → `v_mercado`; `v_hay_vigente` | OK: `role_id` lleno en 597/597 activos CL y 78/78 PE (2026-11-01) |
| Historial de sueldo y movimientos | `rh.vw_employees_anterior`, `rh.vw_job_history_cambios` | Existen en la BD (solo CL); `employee_id` = `rh.employees.id`; `variacion_sueldo_pct` en % (5,0); `variacion_pct` de los cambios se asume igual (confirmar). **No están en el ETL** |
| Zoom, hover, doble clic, cascada | ECharts + JS | OK |
| Banda salarial | — | No existe: diseño pendiente |

## Cruce
persona activa (`rh.employees` / `rh_peru.employees`) → `role_id` → `cargo_empresa (pais, id_origen)` → homologación vigente (último `analisis` con `cargo_empresa_id` del estudio) → `v_mercado` COMP1 → + `v_hay_vigente` (grado, puntos) → + (CL) `rh.vw_employees_anterior` por `employee_id`.

## Implementación
Migración `038_dotacion.sql` (vistas `v_dotacion` y `v_homologacion_vigente`), `repo.dotacion`, `repo.historial_persona`, `GET /dotacion`, `GET /dotacion/historial`, `PersonaOut`, `CambioOut`, tests, `Dotacion.jsx` y `FichaPersona.jsx`.

## Riesgos de datos a mostrar (no ocultar)
- `role_id` nulo o sin fila en `cargo_empresa`.
- Cargo sin homologar o sin evaluación HAY.
- Nivel sin mediana (supresión Mercer) → respaldo en promedio, marcado; sin P25/P75 → "sin referencia".
- `url_picture` vencida → mostrar iniciales si la imagen falla (`onError`).
- Reajustes atípicos (23 negativos y 61 > 30 % al 2026-11-01): marcados en la ficha.
- El cambio de área compara nombres, no IDs: las recodificaciones de BUK no aparecen.
- **ETL:** las vistas `rh.vw_*` y `compensaciones.v_dotacion` dependen de `rh.employees` / `rh.job_history`. Si el ETL hace `DROP TABLE … CASCADE` al recargar, las borra sin aviso (sin `CASCADE`, la carga falla). Confirmar que el ETL recarga con `TRUNCATE`/`INSERT` o que recrea las vistas al final.
