# Plan de implementación: Costos Perú

**Diseño de referencia:** `docs/superpowers/specs/2026-08-19-costos-peru-design.md`
**Objetivo:** habilitar Costos Chile/Perú con una sola pantalla y API, sin mezclar datos ni monedas.

## Restricciones

- No modificar datos de `rh` ni `rh_peru`. Todo lo nuevo vive en el schema `costos`.
- Perú usa sólo liquidaciones con `cerrada IS TRUE`.
- Costo Perú incluye `haber` y `aporte`; excluye `descuento` e `informativo`.
- No implementar conversión monetaria ni comparación entre países.
- **Los nombres de campo de la API no cambian.** `persona_rut` y `jefatura_rut` siguen siendo los
  identificadores de persona y jefatura; en Chile transportan el RUT y en Perú el DNI. Las vistas de
  Perú exponen sus columnas con los mismos nombres que Chile (`rut`, `rut_boss`), de modo que el
  país sólo cambia el *origen*, nunca el contrato ni el SQL de filtrado.

## Decisiones tomadas en la revisión (2026-08-19)

Validadas contra los datos reales de `rh_peru` (119 colaboradores, 2.507 liquidaciones,
146.875 ítems; junio-2026 cerrado = 557.673 PEN / 76 personas):

1. **Vistas normales, no materializadas.** La vista Perú filtrada son 17.642 filas y agrega 12
   meses en ~100 ms sin índices. No hay `REFRESH`, no hay dato rancio y el mes aparece solo en
   cuanto el ETL lo marca cerrado. Chile mantiene sus MV (330.377 filas).
2. **La moneda se resuelve en el frontend.** El frontend ya sabe qué país eligió; no se agrega
   `moneda` a ningún schema de respuesta.
3. **`pais` con default `"chile"`**, no obligatorio: permite desplegar backend antes que frontend.
4. **Join por `document_number`, nunca por `employee_id`**: 26 de 2.507 liquidaciones tienen un
   `employee_id` que no existe en `rh_peru.employees`.
5. **`income_type` de los aportes** (NULL en los 9.457 ítems `APORTE`) se etiqueta `aporte_patronal`.
6. **Conceptos normalizados** con `initcap(trim(name))`: hoy conviven `Eps`/`EPS` y
   `Trabajo en sobretiempo 25/35/100%` en dos grafías.
7. **Se excluyen las personas de prueba** `00000000` y `11111111` (registros de `CRAMER CHILE SAC`
   dentro de `rh_peru`, 92 PEN históricos).
8. **Perú queda un mes atrás de Chile.** Chile no filtra `cerrada` y seguirá así; Perú mostrará el
   banner de "último cerrado" cuando el mes en curso no esté cerrado. Asimetría aceptada.
9. **Se corrige la auto-jefatura** (persona que es jefe de sí misma: 5 en Perú, 180 en Chile) en
   ambos países.
10. **Todo cae al último mes cerrado cuando el rango filtrado está vacío**: treemap y top vía
   `CostosService._rango_efectivo`, y también `costo_total_periodo`, que si no mostraba S/ 0 como
   cifra principal junto a un banner anunciando otro mes. Salió de la prueba end-to-end: con el período por defecto
   (mes anterior al actual) Perú mostraba KPIs de junio y treemap/top vacíos, porque el rango
   filtrado no tiene datos hasta que el mes cierra. Chile hereda la misma consistencia cuando se
   elige un mes futuro.

## 1. Migración `016_create_costos_peru_views.sql`

Crear en `backend/migrations/016_create_costos_peru_views.sql`:

- `costos.v_costos_colaboradores_peru` — vista normal, mismo contrato de columnas que
  `costos.mv_costos_colaboradores`: `pay_period, anio, mes, rut, full_name, cargo, contract_type,
  employee_status, base_wage, rut_boss, jefatura_nombre, jefatura_cargo, empresa, area, subarea,
  centro_costo, centro_costo_efectivo, item_type, income_type, subtype, concepto, amount,
  imponible, taxable`.
  Reglas: `hs.cerrada IS TRUE`; `upper(trim(hsi.item_type)) NOT IN ('DESCUENTO','INFORMATIVO')`;
  `initcap(trim(hsi.name)) AS concepto`; `CASE WHEN upper(trim(hsi.item_type)) = 'APORTE'
  THEN 'aporte_patronal' ELSE hsi.income_type END AS income_type`; exclusión de los documentos de
  prueba. Joins: `hsi.liquidacion_id = hs.liquidacion_id`,
  `e.document_number = hs.document_number`, `a.id = e.area_id`,
  `jefe.document_number = e.dni_boss`.
- `costos.v_jerarquia_jefatura_peru` — recursiva sobre `dni_boss`, tope 10 niveles, con guarda
  `e.document_number <> c.descendiente_rut` para no expandir auto-jefaturas. Columnas
  `jefe_rut, descendiente_rut, nivel`.
- `costos.v_dimensiones_peru`, `costos.v_jefes_peru` — equivalentes a las de Chile sobre `rh_peru`,
  con la misma exclusión de personas de prueba y `sub.document_number <> e.document_number` en el
  conteo de subordinados.
- `costos.v_personas_peru` y `costos.v_personas_chile` — adaptadores del autocomplete de personas
  (`rut, full_name, cargo, empresa, area`) para que el repositorio consulte una sola forma en ambos
  países.
- Corrección Chile: recrear `costos.v_jefes` y `costos.mv_jerarquia_jefatura` con la guarda de
  auto-jefatura (`rut_boss <> rut` / `e.rut <> c.descendiente_rut`).

No se crean índices: las vistas normales heredan los de las tablas base y el volumen no los
justifica.

Validación tras aplicarla:

```sql
SELECT COUNT(*) FROM costos.v_costos_colaboradores_peru;                        -- ~17.600
SELECT MAX(pay_period) FROM costos.v_costos_colaboradores_peru;                 -- 2026-06-01
SELECT DISTINCT upper(trim(item_type)) FROM costos.v_costos_colaboradores_peru; -- HABER, APORTE
SELECT round(SUM(amount)) FROM costos.v_costos_colaboradores_peru
 WHERE pay_period = DATE '2026-06-01';                                          -- 557673
SELECT COUNT(*) FROM costos.v_jefes j
 JOIN rh.employees e ON e.rut = j.rut AND e.rut_boss = e.rut;                    -- sólo jefes reales
```

## 2. Selección segura de fuentes en el repositorio

En `backend/app/repositories/costos_repo.py`, un mapa cerrado a nivel de módulo:

```python
COUNTRY_SOURCES = {
    "chile": {
        "costos": "costos.mv_costos_colaboradores",
        "jerarquia": "costos.mv_jerarquia_jefatura",
        "dimensiones": "costos.v_dimensiones",
        "personas": "costos.v_personas_chile",
        "jefes": "costos.v_jefes",
    },
    "peru": {
        "costos": "costos.v_costos_colaboradores_peru",
        "jerarquia": "costos.v_jerarquia_jefatura_peru",
        "dimensiones": "costos.v_dimensiones_peru",
        "personas": "costos.v_personas_peru",
        "jefes": "costos.v_jefes_peru",
    },
}
```

`CostosRepository.__init__(self, db, pais="chile")` resuelve `self.src = COUNTRY_SOURCES[pais]`;
un país fuera del mapa falla antes de tocar SQL. Ningún nombre de tabla se interpola desde la
request.

`build_where()` recibe además el nombre de la vista de jerarquía (hoy tiene
`costos.mv_jerarquia_jefatura` fijo en el filtro por jefatura). `top_personas()` repite el nombre de
la vista de costos en una subconsulta correlacionada: también debe salir del mapa.

Como las columnas de ambas vistas se llaman igual, no hay más cambios de SQL que los nombres de
origen.

## 3. Propagar `pais` por schemas, service y endpoints

- `backend/app/schemas/costos.py`: `PaisCostos = Literal["chile", "peru"]`; agregar
  `pais: PaisCostos = "chile"` a `FilterRequest` y `CompareRequest`. Nada más cambia.
- `backend/app/services/costos_service.py`: el service recibe el repositorio ya construido con su
  país, así que basta con incluir `pais` en las claves de los caches de dimensiones, income-types y
  conceptos. Borrar `_cache_kpis`, declarado y nunca usado.
- `backend/app/api/v1/endpoints/costos.py`: `_service(db, pais)`; los endpoints POST toman el país
  del body y los GET de catálogos (`/dimensiones`, `/income-types`, `/conceptos`,
  `/personas/buscar`, `/jefes/buscar`) reciben `pais: PaisCostos = Query(default="chile")`.
- `buscar_jefes()` del repositorio: aplicar la guarda de auto-jefatura en el `EXISTS` y en el
  conteo de subordinados.

El fallback al último mes cerrado ya opera dentro de la fuente activa, así que no cruza países sin
cambios adicionales.

## 4. Frontend: selector de país y moneda

- `frontend/src/features/costos/lib/useCostosFilters.js`: agregar `pais: 'chile'` al estado inicial
  y al `payload`. Exponer un `setPais` que conserve `fecha_inicio`/`fecha_fin` y reinicie empresa,
  área, subárea, centro de costo, cargo, persona, jefatura y conceptos.
- `frontend/src/pages/Costos.jsx`: dos botones `Chile | Perú` en la cabecera; al cambiar país,
  `clearSlots()` y recarga de catálogos. El efecto ya usa el patrón `cancelled`, que descarta las
  respuestas del país anterior porque `payloadKey` cambia.
- `frontend/src/services/costos.service.js`: enviar `pais` como query param en los cinco GET de
  catálogos.
- `frontend/src/features/costos/lib/formatters.js`: `formatMoneda(value, pais)` y
  `formatMonedaCompact(value, pais)` con `{ chile: ['es-CL','CLP'], peru: ['es-PE','PEN'] }`; el
  formato compacto deja de anteponer `$` fijo y usa el símbolo del locale. Migrar los consumidores:
  `CostoTotalCard`, `KpiSimpleCard`, `TrendChart`, `TrendSparkline`, `HistoricalContext`,
  `HierarchyTreemap`, `TopJefaturasTable`, `CompareCards`, `CompareChart`.

## 5. Pruebas

Al estilo del repositorio: self-checks ejecutables, sin frameworks nuevos.

- `backend/tests/test_costos_peru.py` (`python -m tests.test_costos_peru`), con sesión simulada:
  país inválido rechazado; cada país resuelve sólo sus fuentes del mapa; el SQL emitido para Perú
  apunta a `costos.v_costos_colaboradores_peru` y a `costos.v_jerarquia_jefatura_peru`; el filtro
  por jefatura usa la jerarquía del país activo; las claves de caché de catálogos incluyen `pais`.
- `frontend/src/features/costos/lib/formatters.test.js` (`node ...`), con `assert`: CLP para Chile,
  PEN para Perú, compacto sin `$` fijo.
- Validaciones SQL de la sección 1 tras aplicar la migración.
- Regresión manual Chile: mismos KPIs, filtros y comparación que antes; `npm run build`.

## Orden de entrega

1. Migración 016 y validación SQL de Perú (más la corrección de auto-jefatura en Chile).
2. Backend: mapa de fuentes, `pais` en schemas/service/endpoints, self-check.
3. Frontend: selector, estado, moneda.
4. Prueba manual de ambos países.
