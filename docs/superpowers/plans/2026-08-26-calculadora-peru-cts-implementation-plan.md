# Plan de implementación: costo empresa anual Perú con CTS

**Diseño de referencia:**
`docs/superpowers/specs/2026-08-26-calculadora-peru-costo-estandar-cts-design.md`  
**Objetivo:** incorporar CTS estimada al único Costo Empresa Anual de Perú,
conservando los aportes y beneficios ya calculados.

## Alcance confirmado

- Perú asume una posición anual completa de régimen privado general.
- CTS estimada: `sueldoBase + gratificacionesAnual / 12`, redondeada a PEN.
- Vida Ley mantiene la tasa y tope existentes en `APORTES_PATRONALES`; no se
  crean controles nuevos.
- El único `costoTotalEmpresaAnual` suma costo mensual por doce, gratificaciones
  con bonificación extraordinaria, CTS, bono empresa y los extras disponibles
  de Perú (asignación familiar, canasta y utilidades).
- Utilidades sigue siendo una estimación contextual. Si su consulta falla, se
  muestra el total de los conceptos disponibles y una advertencia; no se
  oculta el total anual.
- Sin cambios de lógica en Chile, Brasil, backend, migraciones ni la tabla de
  configuración.

## 1. Extender el resultado de cálculo Perú

**Archivo:** `frontend/src/features/calculadora/lib/calculations.js`

1. En `calcularPeru`, calcular `ctsAnual` después de obtener
   `gratificacionesAnual` y antes de construir el costo anual:

   ```text
   ctsAnual = round(sueldoBase + gratificacionesAnual / 12)
   ```

2. Sumar `ctsAnual` a `costoTotalEmpresaAnual` junto con:
   - `costoTotalEmpresa × 12`;
   - `gratificacionesCostoAnual`;
   - `bonoEmpresaAnual.costoEmpresa`.

3. Exponer `ctsAnual` en el objeto de resultados de Perú.

4. Mantener `aplicarExtrasPeru` como la etapa que agrega reparto de utilidades,
   asignación familiar y canasta a ese mismo `costoTotalEmpresaAnual`. No crear
   una segunda propiedad de total anual.

5. Agregar `ctsAnual: 0` a los contratos de resultado vacíos de Brasil y al
   retorno de Chile. Esto evita resultados de forma distinta sin introducir
   lógica CTS fuera de Perú.

## 2. Mostrar CTS y conservar un único total anual

**Archivo:** `frontend/src/features/calculadora/components/Resultados.jsx`

1. En el acordeón Perú de **Costo Empresa Anual**, insertar una fila después del
   bloque de gratificaciones:

   ```text
   CTS estimada (provisión anual)     S/ ...
   ```

2. Mantener el desglose actual de bono empresa, asignación familiar, canasta y
   utilidades. Son filas explicativas del mismo total anual; no se presentan
   como una segunda tarjeta o subtotal.

3. Reestructurar la condición `utilidadesError` para que sea una advertencia
   independiente. El detalle de los extras conocidos y la fila **Total Costo
   Empresa Anual** se deben renderizar siempre.

4. La cabecera del acordeón y la tarjeta de resultado continúan usando
   `resultados.costoTotalEmpresaAnual`; ambos muestran exactamente la misma
   cifra final.

## 3. Actualizar las pruebas de cálculo

**Archivo:** `frontend/src/features/calculadora/lib/calculations.selfcheck.mjs`

1. Añadir una sección Perú CTS que valide, para un sueldo base conocido:
   - `ctsAnual === sueldoBase + gratificacionesAnual / 12`;
   - el costo anual contiene exactamente una CTS;
   - CTS no modifica líquido, descuentos ni costo mensual.

2. Ejecutar la misma comprobación en ambos modos de cálculo:
   `base_a_liquido` y `liquido_a_base`.

3. Ajustar las expectativas existentes de costo anual para incluir CTS antes de
   sumar extras. Las comprobaciones de utilidades siguen verificando que cada
   extra se suma una sola vez.

4. Añadir comprobaciones de regresión para Chile y Brasil: ambos exponen
   `ctsAnual === 0` y mantienen sus totales anuales actuales.

## 4. Verificación

Ejecutar, sin modificar datos ni configuración productiva:

```powershell
node frontend/src/features/calculadora/lib/calculations.selfcheck.mjs
npm --prefix frontend run build
```

Revisión manual de la vista Perú:

1. Simular un sueldo base y confirmar que la CTS aparece una vez en el detalle
   anual.
2. Confirmar que el total anual es la suma visible de todos los conceptos.
3. Ingresar bono empresa y habilitar asignación familiar; verificar que ambos
   se agregan al mismo total.
4. Simular una falla de utilidades; verificar que aparece la advertencia y que
   el total anual sigue visible sin ese ítem.
5. Alternar Chile y Brasil para confirmar que no aparece CTS en sus vistas.

## Riesgos y decisiones explícitas

- La CTS usa sueldo base y las gratificaciones que hoy calcula la aplicación;
  no prorratea por fecha de contratación ni distingue variables regulares.
- La prima Vida Ley de 0,27% sigue siendo una estimación corporativa vigente en
  la configuración, no una tasa legal fija. Nómina podrá corregirla en la base
  de datos sin despliegue.
- La tasa, tope y aplicabilidad individual de EPS/SCTR/Vida Ley no cambian en
  este trabajo; se mantiene la aproximación global existente.
- Las utilidades continúan dependiendo de datos de nómina y renta proyectada,
  por lo que son un componente disponible sólo cuando la proyección responde.
