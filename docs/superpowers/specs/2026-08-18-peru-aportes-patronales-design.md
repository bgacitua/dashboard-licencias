# Diseño: aportes patronales de Perú en la calculadora

**Fecha:** 2026-08-18  
**Ámbito:** Calculadora de sueldos — Perú  
**Estado:** Propuesta para revisión

## Objetivo

Incorporar los aportes patronales que la nómina histórica peruana registra como
`Eps`, `Essalud`, `Sctr Pensión`, `Sctr Salud` y `Vida Ley`.

La calculadora conservará su interfaz y flujo actuales. Los aportes se leerán
desde la configuración de Perú en la base de datos; no habrá campos nuevos que
el usuario deba editar en cada simulación.

## Regla fundamental

Los aportes patronales no modifican el sueldo base ni los descuentos del
trabajador.

```text
Sueldo líquido = haberes - descuentos del trabajador
Costo empresa  = haberes + aportes patronales
```

Por tanto, AFP, comisión AFP, seguro de invalidez/sobrevivencia e impuesto de
quinta categoría continúan determinando el líquido. Los cinco aportes de este
diseño sólo incrementan el costo empresa mensual y anual.

## Evidencia de las liquidaciones históricas

En la muestra de abril de 2026, EPS y EsSalud aparecen juntos con una relación
1:3. Esto corresponde a 2,25% y 6,75%, respectivamente, que en conjunto
mantienen el aporte de salud patronal de 9%.

SCTR Salud se comporta como una tasa de 0,70% sobre la base de salud en las
filas revisadas. SCTR Pensión se comporta como 0,70% con una base topada en
aproximadamente S/ 12.598,57. Vida Ley se comporta como 0,27% con una base
topada en aproximadamente S/ 12.600. Por ello ambas deben soportar porcentaje
con tope, en lugar de forzarlas a un porcentaje simple o a un monto fijo.

## Alternativas consideradas

### 1. Cinco tasas fijas sobre el imponible

Es la alternativa más simple, pero calcularía incorrectamente SCTR Pensión y
Vida Ley cuando exista tope o una base distinta.

### 2. Catálogo genérico de aportes patronales — seleccionado

La configuración de país define un catálogo de aportes con su tipo de cálculo.
El frontend lo consume sin exponer controles por trabajador. Conserva el patrón
actual de tasas genéricas y permite representar porcentajes, topes y primas
fijas.

### 3. Perfiles por trabajador o cargo

Ofrecería precisión individual, pero requiere selección y mantención adicional.
Queda fuera del alcance de esta primera integración.

## Configuración de Perú

`calculadora.country_config.tasas` agregará un arreglo `APORTES_PATRONALES`.
Cada entrada es independiente y la calculadora sólo procesará las activas.

```json
{
  "APORTES_PATRONALES": [
    {
      "id": "eps",
      "nombre": "EPS",
      "tipo": "porcentaje",
      "tasa": 0.0225,
      "base": "imponible",
      "activo": true
    },
    {
      "id": "essalud",
      "nombre": "EsSalud",
      "tipo": "porcentaje",
      "tasa": 0.0675,
      "base": "imponible",
      "activo": true
    },
    {
      "id": "sctr_salud",
      "nombre": "SCTR Salud",
      "tipo": "porcentaje",
      "tasa": 0.007,
      "base": "imponible",
      "activo": true
    },
    {
      "id": "sctr_pension",
      "nombre": "SCTR Pensión",
      "tipo": "porcentaje_con_tope",
      "tasa": 0.007,
      "base": "imponible",
      "tope": 12598.57,
      "activo": true
    },
    {
      "id": "vida_ley",
      "nombre": "Vida Ley",
      "tipo": "porcentaje_con_tope",
      "tasa": 0.0027,
      "base": "imponible",
      "tope": 12600,
      "activo": true
    }
  ]
}
```

Los valores de SCTR Pensión y Vida Ley del ejemplo son iniciales, derivados de
la muestra disponible, y deberán validarse con el responsable de nómina antes
de cargarse como configuración productiva. El esquema permite cambiarlos en la
base sin modificar código.

### Tipos admitidos

| Tipo | Cálculo |
|---|---|
| `porcentaje` | `base × tasa` |
| `porcentaje_con_tope` | `min(base, tope) × tasa` |
| `monto_fijo` | `monto` mensual |

La única base inicial será `imponible`, ya definida por la calculadora actual
para Perú. Un concepto inválido, inactivo o sin los valores requeridos se
omitirá y se reportará como advertencia de configuración; no se inventarán
tasas en el frontend.

## Cálculo y resultados

1. Se calcula el sueldo base, los haberes, los descuentos del trabajador y el
   líquido con la lógica Perú existente.
2. Se recorre el catálogo de aportes activos y se calcula el monto mensual de
   cada uno.
3. `totalPatronal` pasa a ser la suma de los cinco aportes configurados.
4. `costoTotalEmpresa` se calcula como `totalHaberes + totalPatronal`.
5. `costoTotalEmpresaAnual` considera doce meses de dichos costos y conserva la
   lógica vigente de gratificaciones y beneficios anuales.

La lógica de gratificaciones se corregirá semánticamente en esta misma mejora:
la bonificación extraordinaria se presentará como tal y no como EsSalud sobre
gratificaciones. El monto dependerá del esquema de salud configurado (9% con
EsSalud o 6,75% con EPS).

## Interfaz

No se agregan entradas al formulario. En el acordeón existente **Costo Empresa
Mensual** para Perú, se reemplaza la fila única de EsSalud por un grupo
**Aportes patronales** con las filas activas del catálogo y su subtotal.

```text
Costo Empresa Mensual
  Sueldo Base
  ...haberes existentes...
  Aportes patronales
    EPS
    EsSalud
    SCTR Salud
    SCTR Pensión
    Vida Ley
  Total costos patronales
```

Si un aporte no está activo, no se muestra. Esto conserva el estilo de filas y
acordeones actual, evita controles adicionales y hace visible la composición
del costo de contratación.

## Backend, validación y compatibilidad

- El contrato `CountryConfigOut.tasas` seguirá aceptando claves dinámicas, pero
  se validará específicamente `APORTES_PATRONALES` para Perú.
- La respuesta de configuración expondrá advertencias claras ante identificador
  repetido, tasa negativa, monto negativo, tipo desconocido o tope ausente.
- Mientras la configuración nueva no exista, la calculadora usará de forma
  transitoria la regla actual de EsSalud 9%, con advertencia de que faltan
  aportes patronales detallados.
- La validación no modificará la lógica de Chile ni Brasil.

## Pruebas de aceptación

1. Con EPS 2,25% y EsSalud 6,75%, ambos montos suman exactamente 9% del
   imponible; el líquido y sueldo base no cambian.
2. SCTR Salud se suma a costo empresa, pero no a descuentos del trabajador.
3. SCTR Pensión aplica su tope cuando el imponible lo supera.
4. Vida Ley aplica la tasa configurada y respeta su tope.
5. Los cinco aportes se muestran sólo cuando están activos y el subtotal es la
   suma de sus filas.
6. Una configuración inválida muestra advertencia y no entrega un resultado
   silenciosamente incorrecto.
7. Chile y Brasil conservan resultados y vistas sin cambios.

## Fuera de alcance

- Configuración por trabajador, cargo, centro de costo o actividad de riesgo.
- Carga automática de primas desde pólizas o aseguradoras.
- Cambios a la liquidación histórica o al módulo de remuneraciones.
