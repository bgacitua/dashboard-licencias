# Diseño: costo empresa estándar Perú con CTS

**Fecha:** 2026-08-26  
**Ámbito:** Calculadora de sueldos — Perú  
**Estado:** Aprobado para planificación

## Objetivo

Entregar a RR.HH. y ejecutivos de Perú una estimación simple y consistente del
costo anual de una posición. La persona usuaria ingresa sueldo base o líquido
deseado; la calculadora resuelve el sueldo base y muestra el costo empresa
anual estimado, incluyendo la CTS y los adicionales aplicables.

El diseño usa los aportes, beneficios y flujos ya presentes en la calculadora.
No busca reemplazar una liquidación de remuneraciones ni modelar excepciones
individuales.

## Alcance funcional

El cálculo aplica al supuesto de una posición anual de régimen privado general
con remuneración estable. El componente anual base considera:

```text
Costo anual base =
    (Costo empresa mensual actual × 12)
  + Gratificaciones anuales y bonificación extraordinaria
  + CTS anual estimada
```

El costo empresa mensual actual se conserva sin cambios. Ya incorpora los
haberes recurrentes y los aportes patronales activos de la configuración de
Perú: EPS, EsSalud, SCTR Salud, SCTR Pensión y Vida Ley.

La CTS se calcula sólo para el horizonte anual completo:

```text
CTS = sueldo base + (gratificaciones anuales / 12)
```

Como la calculadora actual modela dos gratificaciones iguales al sueldo base,
la fórmula equivale a:

```text
CTS = sueldo base × 7 / 6
```

La CTS es exclusivamente un costo anual de la empresa. No modifica sueldo
líquido, descuentos del trabajador ni el costo mensual mostrado.

## Beneficios y proyecciones adicionales

Los beneficios que dependen de una decisión de la empresa o de contexto se
conservan como ítems separados en el detalle, pero siempre se suman al único
**Costo Empresa Anual** cuando son aplicables:

| Concepto | Tratamiento |
|---|---|
| Refrigerio | Beneficio mensual existente; ya está incluido en el costo mensual. |
| Bono empresa | Beneficio anual existente, fijo o porcentaje del sueldo base; se suma sólo si fue ingresado. |
| Utilidades | Proyección contextual opcional, basada en renta proyectada, actividad y nómina vigente. |
| Asignación familiar | Concepto existente activado por el usuario; permanece en el bloque de proyecciones de esta mejora. |
| Canasta navideña | Beneficio anual configurable existente; permanece en el bloque de proyecciones. |

Una falla al obtener utilidades no puede ocultar ni invalidar el total de los
costos que sí se pudieron calcular. En ese caso, la interfaz advierte que las
utilidades no están incluidas en el total mostrado.

## Vida Ley

Vida Ley se mantiene dentro del costo estándar mediante el aporte patronal ya
configurado en `APORTES_PATRONALES`. La tasa actual de 0,27% se trata como
prima estimada de la empresa, no como una tasa legal universal. No se agrega
ningún control al formulario: Nómina podrá actualizar esa tasa y su tope en la
base de datos cuando valide la póliza vigente.

## Datos y contratos

No se requieren migraciones ni campos nuevos en la base de datos para CTS.
La fórmula usa los valores que ya devuelve el cálculo Perú:

- `sueldoBase`
- `gratificacionesAnual`
- `costoTotalEmpresa`
- `gratificacionesCostoAnual`
- `bonoEmpresaAnual`

El resultado Perú expondrá explícitamente:

- `ctsAnual`: CTS anual estimada.
- `costoTotalEmpresaAnual`: único total anual; incluye el costo anual base,
  CTS y cada beneficio o proyección disponible.

En Chile y Brasil, `ctsAnual` será `0` y el contrato actual de sus resultados
no cambiará funcionalmente.

## Interfaz

En el acordeón **Costo Empresa Anual** de Perú se mostrarán, en este orden:

```text
Costo mensual × 12
Gratificaciones (Jul + Dic)
  → Bonificación extraordinaria
CTS estimada (2 depósitos semestrales)

Beneficios y proyecciones adicionales (sólo si existen)
  Bono empresa
  Asignación familiar
  Canasta navideña
  Reparto de utilidades estimado
Total costo empresa anual
```

La tarjeta de resultado principal y el total del acordeón usan el mismo total
anual. El texto de ayuda de CTS indicará que es una provisión anual aproximada
para una posición de doce meses.

## Fuera de alcance

- Prorrateo de CTS por fecha de contratación, meses o días trabajados.
- Distinción de conceptos variables que podrían o no integrar la remuneración
  computable de CTS.
- Configuración individual por persona, cargo, actividad de riesgo o régimen.
- Selección de EPS, ONP/AFP, SCTR o pólizas por persona.
- Cálculo del líquido anual incluyendo utilidades o beneficios extraordinarios.
- Cambios a las fórmulas existentes de gratificaciones, refrigerio, aportes
  patronales, utilidades o asignación familiar.

## Criterios de aceptación

1. Para Perú, `ctsAnual` es `sueldoBase + gratificacionesAnual / 12`,
   redondeada a soles.
2. `costoTotalEmpresaAnual` es igual a `costoTotalEmpresa × 12`, más
   `gratificacionesCostoAnual`, más `ctsAnual`, más el bono empresa anual y
   los extras disponibles de Perú.
3. Si no hay extras, el total anual contiene sólo sus componentes base. Si
   falla la proyección de utilidades, se muestra el total de los conceptos
   disponibles y una advertencia explícita de la omisión.
4. La vista anual identifica CTS como costo estimado, desglosa los beneficios
   aplicables y muestra un solo total anual.
5. Los resultados de Chile y Brasil se conservan; no reciben CTS ni el bloque
   de proyecciones Perú.
6. Las pruebas existentes de aportes, gratificaciones y utilidades se ajustan
   a los nuevos nombres de totales y se agregan pruebas específicas para CTS.
