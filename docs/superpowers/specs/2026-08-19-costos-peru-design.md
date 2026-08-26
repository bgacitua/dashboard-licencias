# Design: Costos por país — Perú

**Fecha:** 2026-08-19  
**Repositorio:** personas-cramer  
**Estado:** aprobado para especificación; pendiente de revisión del documento

## Objetivo

Extender el módulo Costos por área y jefatura para alternar entre Chile y Perú. Cada país conserva una vista de datos y moneda propias, pero usa la misma experiencia, filtros, métricas, gráficos y comparación interna.

Esta fase no compara ni convierte costos entre países.

## Alcance

- Añadir un selector fijo `Chile | Perú` en la pantalla Costos.
- Incorporar una vista materializada de Costos para Perú desde `rh_peru`.
- Hacer que todos los endpoints de Costos reciban un país y consulten únicamente su fuente autorizada.
- Formatear costos con CLP para Chile y PEN para Perú.
- Mantener la funcionalidad actual de Chile.

Fuera de alcance:

- Comparación simultánea Chile versus Perú.
- Conversión de moneda o tipos de cambio.
- Homologación de conceptos entre países.
- Cambios a la calculadora o sus configuraciones legales.

## Datos y regla de costo Perú

La fuente Perú ya está disponible en PostgreSQL bajo `rh_peru`:

| Entidad | Tabla | Identificador y uso |
| --- | --- | --- |
| Colaborador | `rh_peru.employees` | `document_number` es la clave primaria y representa el DNI/documento. |
| Organización | `rh_peru.areas` | Contiene empresa, área, subárea y centro de costo. |
| Liquidación | `rh_peru.historical_settlements` | `liquidacion_id`, `document_number`, `pay_period` y estado `cerrada`. |
| Línea de liquidación | `rh_peru.historical_settlement_items` | `liquidacion_id`, concepto y monto. |

Los perfiles ejecutados confirmaron que todos los ítems encuentran su liquidación y todas las liquidaciones encuentran a su colaborador. La moneda de todos los colaboradores es `PEN`.

La vista Perú considera costo real sólo cuando la liquidación está cerrada:

```sql
hs.cerrada IS TRUE
AND upper(trim(hsi.item_type)) NOT IN ('DESCUENTO', 'INFORMATIVO')
```

Por lo tanto, se incluyen todos los `haber` y todos los `aporte`, incluidos EsSalud, EPS, SCTR, Vida Ley, bonos, gratificaciones y Reparto de Utilidades. Se excluyen los descuentos del colaborador y líneas informativas, provisiones y bases de cálculo.

Los costos históricos de colaboradores que hoy estén inactivos se mantienen. El estado `activo` se usa solamente para catálogos, búsquedas y jerarquía vigente.

Julio de 2026 está cargado pero no cerrado; no debe entrar a la vista ni a los indicadores hasta que el ETL lo marque como cerrado.

## Arquitectura

Se mantiene una sola página, API y conjunto de componentes. Cada país tiene su propia vista materializada.

```text
[Chile | Perú] → país en filtros → API Costos → selector seguro de origen
                                              ├─ Chile: costos.mv_costos_colaboradores
                                              └─ Perú:  costos.mv_costos_colaboradores_peru
```

La selección de origen se define en código mediante un mapa cerrado; el nombre de una vista nunca proviene directamente de una request.

La nueva vista materializada Perú expone el mismo contrato analítico que la vista Chile:

- período: `pay_period`, `anio`, `mes`;
- persona: identificador genérico, nombre, cargo, contrato y estado;
- jefatura: identificador y nombre;
- organización: empresa, área, subárea y centro de costo efectivo;
- línea de costo: `item_type`, `income_type`, `subtype`, `concepto`, `amount`, `imponible` y `taxable`.

En Perú, la relación de jefatura será `empleado.dni_boss = jefe.document_number`. La relación de persona con liquidación será `employees.document_number = historical_settlements.document_number`. El vínculo entre liquidación e ítems será `liquidacion_id`.

Los contratos de backend dejan de denominar los identificadores como `rut`; usarán nombres neutrales como `persona_id` y `jefatura_id`. Chile mapeará su RUT a esos campos y Perú su DNI/documento. La etiqueta visible para el usuario no cambia.

## Frontend y comportamiento

La cabecera del módulo tendrá dos botones: `Chile` y `Perú`. Chile es el valor inicial.

Al cambiar de país:

1. se conserva el período seleccionado;
2. se reinician empresa, área, subárea, centro de costo, cargo, persona, jefatura y conceptos;
3. se eliminan slots de comparación existentes;
4. se cargan catálogos y resultados del país seleccionado.

El modo comparación permanece dentro de un país. No se puede crear un slot con datos de un país y evaluarlo tras cambiar al otro.

Los componentes de presentación reciben la moneda activa. Chile usa `es-CL`/`CLP`; Perú usa `es-PE`/`PEN`. Se reemplaza el formato fijo CLP del módulo.

## API y caché

`pais` será obligatorio en los cuerpos de filtros y comparación, con valores permitidos `chile` y `peru`. Los endpoints de catálogos, personas y jefaturas lo recibirán como query parameter obligatorio.

La resolución de país determina:

- vista de costos;
- vista/consultas de dimensiones, personas y jefaturas;
- moneda de presentación.

Todas las claves de caché incluyen `pais`, evitando reutilizar catálogos o conceptos de un país en otro.

## Errores y casos borde

- País inválido: respuesta de validación 422; nunca se interpolan nombres de tabla desde la entrada.
- País sin liquidaciones cerradas en el período: se usa el último período cerrado del mismo país y se informa con el banner actual.
- País sin datos cerrados para los filtros activos: respuesta vacía con mensaje, sin reutilizar resultados del otro país.
- Un período cargado pero no cerrado en Perú no aparece como mes disponible para indicadores ni tendencias.

## Pruebas

- Resolver Chile y Perú sólo contra sus fuentes permitidas.
- Perú: relación por `document_number`, jefatura por `dni_boss`, área y centro de costo efectivo.
- Perú: se incluyen `haber` y `aporte`; se excluyen `descuento` e `informativo`.
- Perú: se excluyen liquidaciones no cerradas.
- Caché segmentada por país.
- Cambio de país en frontend: conserva período, limpia filtros y slots, y cambia el formato monetario.
- Regresión Chile: mismos resultados y filtros que antes de la extensión.

## Criterio de aceptación

Una persona con permiso para Costos puede alternar entre Chile y Perú. En cada país ve los datos correctos y cerrados de su propia fuente, expresados en CLP o PEN respectivamente, con la misma interacción existente y sin mezclar datos de países.
