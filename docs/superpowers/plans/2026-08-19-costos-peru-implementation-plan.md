# Plan de implementación: Costos Perú

**Diseño de referencia:** `docs/superpowers/specs/2026-08-19-costos-peru-design.md`  
**Objetivo:** habilitar Costos Chile/Perú con una sola pantalla y API, sin mezclar datos ni monedas.

## Restricciones

- No modificar datos de `rh` ni `rh_peru`.
- Perú usa sólo liquidaciones con `cerrada IS TRUE`.
- Costo Perú incluye `haber` y `aporte`; excluye `descuento` e `informativo`.
- No implementar conversión monetaria ni comparación entre países.

## 1. Añadir las vistas analíticas de Perú

Crear `backend/migrations/016_create_costos_peru_views.sql` a partir del SQL validado en la sección siguiente. Debe crear:

- `costos.mv_costos_colaboradores_peru`;
- `costos.mv_jerarquia_jefatura_peru`;
- `costos.v_dimensiones_peru`;
- `costos.v_personas_peru`;
- `costos.v_jefes_peru`.

La vista principal debe usar `document_number` como identificador genérico de persona y `dni_boss` como identificador de jefatura. Añadir los índices de período, organización, persona, jefatura, cargo e `income_type`.

Validar tras aplicarla:

```sql
SELECT COUNT(*) FROM costos.mv_costos_colaboradores_peru;
SELECT MAX(pay_period) FROM costos.mv_costos_colaboradores_peru;
SELECT DISTINCT upper(trim(item_type)) FROM costos.mv_costos_colaboradores_peru;
```

El máximo período inicial esperado es junio de 2026 mientras julio permanezca abierto.

## 2. Generalizar los contratos de Costos

Modificar `backend/app/schemas/costos.py`:

- definir `PaisCostos = Literal["chile", "peru"]`;
- hacer `pais` obligatorio en `FilterRequest` y `CompareRequest`;
- reemplazar en los contratos `persona_rut` y `jefatura_rut` por `persona_id` y `jefatura_id`;
- reemplazar `rut` por `persona_id` y `jefatura_rut` por `jefatura_id` en las respuestas de autocompletado y top de personas.

Actualizar `frontend/src/features/costos/lib/useCostosFilters.js`, los componentes de autocompletado, slots y tabla top para enviar y consumir los nombres neutrales. Los textos visibles pueden seguir siendo “persona” y “jefatura”; no se debe mostrar un rótulo RUT/DNI.

## 3. Resolver fuentes por país de forma segura

Refactorizar `backend/app/repositories/costos_repo.py` para que `CostosRepository` reciba `pais` y use una configuración cerrada, por ejemplo:

```python
COUNTRY_SOURCES = {
    "chile": {
        "costos": "costos.mv_costos_colaboradores",
        "jerarquia": "costos.mv_jerarquia_jefatura",
        "dimensiones": "costos.v_dimensiones",
        "personas": "costos.v_personas_chile",
        "jefes": "costos.v_jefes",
        "moneda": "CLP",
    },
    "peru": {
        "costos": "costos.mv_costos_colaboradores_peru",
        "jerarquia": "costos.mv_jerarquia_jefatura_peru",
        "dimensiones": "costos.v_dimensiones_peru",
        "personas": "costos.v_personas_peru",
        "jefes": "costos.v_jefes_peru",
        "moneda": "PEN",
    },
}
```

No interpolar `pais` recibido como nombre SQL. Las fuentes sólo pueden salir de este mapa. Crear también `costos.v_personas_chile` como adaptador de la consulta actual para que ambos países expongan el mismo contrato.

Adaptar todos los métodos del repositorio —catálogos, búsquedas, KPIs, series, jerarquía, top y comparación— a los nombres de columna genéricos y fuentes del país activo.

## 4. Propagar país y separar caché

Actualizar `backend/app/services/costos_service.py` y `backend/app/api/v1/endpoints/costos.py`:

- instanciar el repositorio con `filtros.pais`;
- recibir `pais` como query parameter obligatorio en dimensiones, conceptos, personas y jefes;
- usarlo también en comparación;
- incluir `pais` en todas las claves de caché;
- devolver `moneda` junto con resultados de KPIs, series, jerarquía, top y comparación, o en un endpoint único de metadatos de Costos.

El fallback al último mes sólo busca dentro del mismo país. En Perú, julio abierto no aparece porque la vista ya lo excluye.

## 5. Añadir selector de país y formato monetario

Actualizar `frontend/src/pages/Costos.jsx`:

- agregar estado `pais`, con valor inicial `chile`;
- mostrar botones `Chile` y `Perú` en la cabecera;
- enviar `pais` en todos los requests;
- al cambiar país, conservar `fecha_inicio` y `fecha_fin`, limpiar filtros específicos y eliminar slots de comparación;
- cancelar o ignorar respuestas pendientes del país anterior.

Actualizar `frontend/src/features/costos/lib/formatters.js` y sus consumidores para recibir la moneda activa. Los formatos serán `es-CL`/`CLP` y `es-PE`/`PEN`; los valores compactos no deben llevar el símbolo fijo `$`.

Actualizar `FiltersBar`, `SlotBuilder`, `AutocompleteInput`, `CompareCards`, `CompareChart`, `CostoTotalCard`, tendencias, histórico, jerarquía y tabla top para transportar la moneda y los identificadores genéricos.

## 6. Refresco operativo

Incorporar al proceso ETL de Perú, después de cargar liquidaciones y marcar períodos cerrados:

```sql
REFRESH MATERIALIZED VIEW costos.mv_costos_colaboradores_peru;
REFRESH MATERIALIZED VIEW costos.mv_jerarquia_jefatura_peru;
```

No refrescar mientras el período esté incompleto si el ETL aún no ha terminado. Al cerrarlo, actualizar las fuentes y luego refrescar ambas vistas.

## 7. Pruebas y validación

Crear pruebas backend con sesión/repositorio simulado para verificar:

- país inválido rechazado y fuentes SQL limitadas al mapa;
- Perú busca por `document_number` y jefatura por `dni_boss`;
- se incluyen `haber` y `aporte`;
- se excluyen `descuento`, `informativo` y liquidaciones no cerradas;
- cachés independientes para Chile y Perú;
- fallback de período no cruza países.

Crear o ampliar pruebas frontend para verificar:

- botón activo y payload de país;
- cambio de país conserva período, limpia filtros y slots;
- CLP se muestra en Chile y PEN en Perú.

Ejecutar las pruebas existentes de Costos y Calculadora para regresión Chile, luego `npm run build` y la suite Python del backend.

## Orden de entrega

1. Migración y validación SQL Perú.
2. Backend con selección segura por país y pruebas.
3. Frontend: selector, estado, contratos neutrales y moneda.
4. Integración con ETL/refresco y prueba manual de ambos países.
