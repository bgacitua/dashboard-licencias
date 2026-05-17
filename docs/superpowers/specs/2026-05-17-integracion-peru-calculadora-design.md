# Design: Integración Peru — Calculadora de Sueldos

**Fecha:** 2026-05-17  
**Repo:** dashboard-licencias  
**Rama base:** main  

---

## Contexto

La calculadora de sueldos en dashboard-licencias actualmente soporta solo Chile con factores hardcodeados en `config.js`. El objetivo es integrar Peru con factores dinámicos, donde la fuente de verdad es la tabla `calculadora.country_config` en SQL Server, actualizada periódicamente por flujos n8n.

La lógica de cálculo Peru de referencia existe en el repo `calculadora-sueldo-web` rama `feat/peru-calculadora-completa`.

---

## Arquitectura general

**Enfoque elegido:** Port directo — lógica de cálculo en el frontend, config siempre desde el backend.

```
SQL Server (country_config)
        ↑ actualiza n8n
        ↓ lee FastAPI
GET /api/calculadora/config/{pais}
        ↓
Frontend (React + Vite)
  config.js         → fallback si backend no responde
  calculations.js   → lógica Chile + Peru
  CalculadoraPage   → toggle país, fetch on change
```

---

## Sección 1: Flujo de datos y carga de configuración

### Carga inicial
Al montar la calculadora, se hace `GET /api/calculadora/config/chile` y se guarda en estado local.

### Cambio de país (toggle)
Al seleccionar Peru:
1. `GET /api/calculadora/config/peru`
2. Actualizar `state.config` con la respuesta
3. Reset de campos dependientes del país:
   - AFP → primer fondo del nuevo país (`"Integra"` para Peru)
   - Sistema salud → `"essalud"` para Peru, `"fonasa"` para Chile
   - Monto y modo → se mantienen

### Fallback
Si el fetch falla, se usa `config.js` con valores reales hardcodeados (no ceros). Para Peru, los valores fallback son los mismos que tiene actualmente la BD.

### Backend — verificación
El endpoint `GET /api/calculadora/config/{pais}` en `calculadora.py` debe mapear correctamente:
- `tasas.TRAMOS_IMPUESTO` (array de tramos UIT)
- `tasas.UIT`
- `tasas.TASA_AFP_OBLIGATORIA`
- `tasas.TASA_SALUD_PATRONAL`
- `tasas.TASA_SEGUROS_INVALIDEZ`
- `tasas.SUELDOS_ANUALES`
- `tasas.DEDUCCION_FIJA_UIT` y `DEDUCCION_ADICIONAL_UIT`

---

## Sección 2: Lógica de cálculo Peru

### Archivos afectados
- **`frontend/src/features/calculadora/lib/calculations.js`** — toda la lógica Peru vive aquí, en una función separada `calcularPeru(modo, monto, afpNombre, config)` llamada desde `calcularRemuneracion`.
- **`frontend/src/features/calculadora/lib/config.js`** — constante `TASAS_PERU` con valores fallback reales.

> Para afinar los cálculos con el equipo Peru, el único archivo a modificar es `calculations.js`, función `calcularPeru`.

### Peru `base → líquido`

```
Sueldo bruto = monto ingresado

Descuentos empleado:
  AFP obligatorio    = bruto × 0.10
  Comisión AFP       = bruto × tasa_afp_seleccionada  (0.0147 – 0.0169)
  Seguro invalidez   = bruto × 0.0137
  Impuesto 5ta cat.  = ver cálculo abajo

Líquido = bruto - AFP_obligatorio - comisión_AFP - seguro_invalidez - impuesto

Costo empleador (mensual):
  EsSalud            = bruto × 0.09   (patronal, no se descuenta del trabajador)
  Gratificaciones    = bruto × (2/12) (julio + diciembre)
  Costo total/mes    = bruto + EsSalud + gratificaciones
```

### Cálculo impuesto 5ta categoría

```
Renta anual proyectada   = bruto × SUELDOS_ANUALES (14)
Deducciones              = (DEDUCCION_FIJA_UIT + DEDUCCION_ADICIONAL_UIT) × UIT
                         = (7 + 3) × 5,500 = 55,000 PEN
Renta neta imponible     = renta_anual - deducciones  (mínimo 0)

Tramos progresivos (TRAMOS_IMPUESTO desde BD):
  0 – 5 UIT    → 8%
  5 – 20 UIT   → 14%
  20 – 35 UIT  → 17%
  35 – 45 UIT  → 20%
  45+ UIT      → 30%

Impuesto anual  = suma de cada tramo aplicado
Impuesto mensual = impuesto_anual / 12
```

Los tramos y tasas se leen siempre desde `config.tasas.TRAMOS_IMPUESTO` (BD), no hardcodeados en la función.

### Peru `líquido → base` (solver iterativo)

```
Objetivo: encontrar bruto tal que calcularPeru("base_a_liquido", bruto, ...) ≈ líquido_deseado

Algoritmo:
  bruto_0 = líquido_deseado
  Para n = 1..50:
    liquido_n = calcularPeru("base_a_liquido", bruto_n, ...)
    error     = líquido_deseado - liquido_n
    si |error| < 1 PEN → converge, retornar bruto_n
    bruto_{n+1} = bruto_n + error × 0.8   (damping factor)
  Si no converge en 50 iter → retornar mejor aproximación
```

### Diferencias estructurales vs Chile (no implementar en Peru)
- Sin cesantía del trabajador
- Sin mutual, SIS, expectativa vida del empleador
- EsSalud es 100% patronal (no aparece como descuento del trabajador)
- Sin gratificación tipo "25% base mensual" — los 2 sueldos extra van al costo anual

---

## Sección 3: Cambios en la UI

### Toggle de país
Se agrega en el header de la calculadora:

```
[ 🇨🇱 Chile ]  [ 🇵🇪 Perú ]
```

Implementado como botones con estado activo, siguiendo el estilo visual existente (Radix UI + Tailwind).

### Campos dinámicos por país

| Campo | Chile | Peru |
|---|---|---|
| AFP selector | 7 fondos | 4 administradoras |
| Sistema salud | FONASA / ISAPRE + campo UF | Label "EsSalud — 9% patronal" (sin input) |
| Moneda | CLP | PEN |
| Movilización | Visible | Visible |
| Bonos empresa | Visible | Visible |

### Panel de resultados — etiquetas Peru

| Concepto | Label mostrado |
|---|---|
| AFP obligatorio + comisión | `AFP (10% + comisión [X]%)` |
| Seguro invalidez | `Seguro invalidez (1.37%)` |
| Impuesto a la renta | `Imp. 5ta categoría` |
| EsSalud | `EsSalud 9% (empleador)` |
| Gratificaciones | `Gratificaciones (2/12)` |

---

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `frontend/src/features/calculadora/lib/calculations.js` | Agregar `calcularPeru()` + bifurcación en `calcularRemuneracion` |
| `frontend/src/features/calculadora/lib/config.js` | Actualizar `TASAS_PERU` con valores reales (fallback) |
| `frontend/src/features/calculadora/CalculadoraPage.jsx` (o equiv.) | Toggle país, fetch on change, reset de campos |
| `frontend/src/features/calculadora/components/` | Campos condicionales por país (AFP, salud, resultados) |
| `backend/app/api/v1/endpoints/calculadora.py` | Verificar mapeo completo de campos Peru |
| `backend/app/models/country_config.py` | Verificar que el modelo expone todos los campos JSONB necesarios |

---

## Fuera de alcance

- Brasil (placeholder, no se implementa en este ciclo)
- Panel de administración para editar factores (lo maneja n8n)
- Integración con APIs externas de tipo de cambio (ya lo hace n8n)
- Cambios al módulo de licencias o marcas
