# Diseño: Calculadora Brasil — MVP de costo empresa

**Fecha:** 2026-08-18  
**Alcance:** Módulo `calculadora`, solo Brasil.

## Objetivo

Incorporar a la calculadora existente una estimación de costo empresa mensual y anual para una contratación CLT bajo régimen general. El MVP replica exactamente el modelo entregado en el archivo `Calculadora - Custo Empresa Total Colaborador 2026 1.xlsx`.

No incluye Simples Nacional, CPRB/desoneração, FAP, particularidades de FPAS, cálculo de descuentos del trabajador, IRRF, rescisión ni costos adicionales sobre las provisiones. Esos aspectos quedan fuera de este ciclo.

## Experiencia de usuario

Brasil conserva el estilo, encabezado, estructura de tarjetas y panel de resultados de Chile y Perú.

- El único dato de entrada es **Salário Base** en BRL.
- Brasil no presenta los modos líquido/base, AFP, sistema de salud, movilización, bonos ni bono empresa, pues no pertenecen al modelo del Excel.
- El panel de resultados muestra solo el salario base, encargos, provisiones y los costos mensual y anual.
- Las etiquetas y formatos monetarios son portugueses y usan BRL.

## Fuente de factores

Los factores se cargan desde `calculadora.country_config.tasas` para `pais = 'brasil'`. No se usan valores locales de respaldo para el MVP Brasil: si falta un factor se muestra una configuración incompleta.

| Clave | Valor inicial | Uso |
| --- | ---: | --- |
| `INSS_PATRONAL` | 0.20 | Encargo patronal sobre salario base |
| `RAT` | 0.015 | Riesgo ambiental del trabajo asumido por la empresa |
| `TERCEIROS` | 0.058 | Contribuciones a terceros según el modelo entregado |
| `FGTS` | 0.08 | Depósito patronal de FGTS |
| `MESES_ANIO` | 12 | Factor anual y de provisiones |

Los valores de RAT y terceros son configurables porque pueden variar con el régimen y actividad de la empresa; el MVP parte de los números del Excel.

## Fórmulas

Para `salario_base`:

```text
inss_patronal = salario_base × INSS_PATRONAL
rat           = salario_base × RAT
terceiros     = salario_base × TERCEIROS
fgts          = salario_base × FGTS

total_encargos = inss_patronal + rat + terceiros + fgts

provision_13  = salario_base / MESES_ANIO
provision_ferias = salario_base / MESES_ANIO
adicional_tercio_ferias = provision_ferias / 3

total_provisiones = provision_13 + provision_ferias + adicional_tercio_ferias

costo_empresa_mensual = salario_base + total_encargos + total_provisiones
costo_empresa_anual = costo_empresa_mensual × MESES_ANIO
```

Con salario de R$25.500, el resultado esperado es R$9.001,50 de encargos, R$4.958,33 de provisiones, R$39.459,83 de costo mensual y R$473.518,00 anual.

## Integración técnica

1. Agregar `calcularBrasil()` junto a los cálculos de Chile y Perú. Debe devolver el contrato de resultados ya consumido por la vista, con campos explícitos para Brasil.
2. Cargar y validar las cinco claves de Brasil desde la configuración servida por el backend.
3. Ajustar el formulario y los resultados con condicionales por país, manteniendo intactas las experiencias Chile y Perú.
4. Brasil debe tener formato BRL y no puede caer en la lógica de cálculo de Chile.
5. Añadir pruebas unitarias para las fórmulas, configuración incompleta y el ejemplo del Excel; ejecutar el build de frontend.

## Manejo de errores

Si `salario_base` es negativo, o falta alguno de los cinco factores, no se calcula un resultado engañoso. La interfaz debe mostrar el error de configuración y conservar el resto de la calculadora operativa.

## Fuera de alcance

- FAP y RAT variable por establecimiento.
- FPAS y terceros dependientes de la actividad.
- Simples Nacional y CPRB/desoneração de folha.
- Descuentos y líquido del trabajador brasileño.
- IRRF, beneficios, indemnizaciones y rescisiones.
