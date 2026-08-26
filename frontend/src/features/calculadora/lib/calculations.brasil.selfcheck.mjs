/**
 * Self-check de la calculadora Brasil (CLT régimen general).
 *
 * Fuentes normativas de los factores usados (vigencia 18-08-2026):
 *   INSS 2026 ....... https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal
 *   IRPF/IRRF ....... https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025
 *   Reducción IRRF .. https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm
 *   Costo empresa ... docs/superpowers/specs/2026-08-18-brasil-calculadora-mvp-design.md
 *
 * Ejecutar:  node src/features/calculadora/lib/calculations.brasil.selfcheck.mjs
 */

import assert from 'node:assert/strict'
import {
  calcularRemuneracion,
  calcularINSSBrasil,
  calcularIRRFBrasil,
  calcularCostoEmpresaBrasil,
  calcularBonoEmpresaBrasil,
  tasaCargasPatronalesBrasil,
  resolverBaseParaLiquidoBrasil,
  factoresBrasilFaltantes,
  conDefaultsBrasil,
  FACTORES_BRASIL,
} from './calculations.js'
import { parseBRLInput, formatBRLInput, parseNumericInput } from './utils.js'

// Réplica de calculadora.country_config.tasas para pais = 'brasil'.
const TASAS = {
  INSS_PATRONAL: 0.2,
  RAT: 0.015,
  RAT_FAP: 1.0,
  TERCEIROS: 0.058,
  FGTS: 0.08,
  MESES_ANIO: 12,
  PROVISION_13_DIVISOR: 12,
  PROVISION_VACACIONES_DIVISOR: 12,
  ADICIONAL_VACACIONES_DIVISOR: 3,
  SALARIO_MINIMO: 1621.0,
  INSS_TRABAJADOR_TRAMOS: [
    { desde: 0.0, hasta: 1621.0, tasa: 0.075 },
    { desde: 1621.0, hasta: 2902.84, tasa: 0.09 },
    { desde: 2902.84, hasta: 4354.27, tasa: 0.12 },
    { desde: 4354.27, hasta: 8475.55, tasa: 0.14 },
  ],
  INSS_TRABAJADOR_TOPE: 8475.55,
  IRRF_DESCUENTO_SIMPLIFICADO: 607.2,
  IRRF_TRAMOS: [
    { desde: 0.0, hasta: 2428.8, tasa: 0.0, rebaja: 0.0 },
    { desde: 2428.8, hasta: 2826.65, tasa: 0.075, rebaja: 182.16 },
    { desde: 2826.65, hasta: 3751.05, tasa: 0.15, rebaja: 394.16 },
    { desde: 3751.05, hasta: 4664.68, tasa: 0.225, rebaja: 675.49 },
    { desde: 4664.68, hasta: null, tasa: 0.275, rebaja: 908.73 },
  ],
  IRRF_REDUCCION_LIMITE_TOTAL: 5000.0,
  IRRF_REDUCCION_LIMITE_PARCIAL: 7350.0,
  IRRF_REDUCCION_MAXIMA: 312.89,
  IRRF_REDUCCION_CONSTANTE: 978.62,
  IRRF_REDUCCION_FACTOR: 0.133145,
}

const CONFIG = { tasas: TASAS }

const check = (nombre, cond) => {
  assert.ok(cond, `FALLO: ${nombre}`)
  console.log(`  ok  ${nombre}`)
}

const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol
const brl = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
/** Valor tal como lo ve el usuario: sólo se redondea al mostrar. */
const mostrado = (v) => Math.round(v * 100) / 100

const calc = (modo, monto, config = CONFIG) =>
  calcularRemuneracion(modo, monto, '', '', 0, 0, 0, 0, [], 'brasil', config, false)

/** Igual que calc(), pero con bono empresa: (monto fijo, tasa, imponible). */
const calcConBono = (modo, monto, bonoMonto, bonoTasa, imponible, config = CONFIG) =>
  calcularRemuneracion(
    modo, monto, '', '', 0, 0, bonoMonto, bonoTasa, [], 'brasil', config, imponible,
  )

// INSS marginal calculado a mano, tramo por tramo.
const inssManual = (sueldo) => {
  const s = Math.min(sueldo, 8475.55)
  let t = 0
  if (s > 0) t += (Math.min(s, 1621.0) - 0) * 0.075
  if (s > 1621.0) t += (Math.min(s, 2902.84) - 1621.0) * 0.09
  if (s > 2902.84) t += (Math.min(s, 4354.27) - 2902.84) * 0.12
  if (s > 4354.27) t += (Math.min(s, 8475.55) - 4354.27) * 0.14
  return t
}

console.log('\n[INSS — cada límite de tramo]')
{
  for (const limite of [1621.0, 2902.84, 4354.27, 8475.55]) {
    for (const s of [limite - 0.01, limite, limite + 0.01]) {
      check(
        `INSS en ${brl(s)} = ${brl(inssManual(s))}`,
        cerca(calcularINSSBrasil(s, TASAS), inssManual(s), 0.000001),
      )
    }
  }
  check('INSS es progresivo, no tasa única sobre el total', calcularINSSBrasil(4000, TASAS) < 4000 * 0.12)
  check('INSS de sueldo 0 es 0', calcularINSSBrasil(0, TASAS) === 0)
}

console.log('\n[INSS — tope]')
{
  const tope = calcularINSSBrasil(8475.55, TASAS)
  check(`tope = ${brl(tope)}`, cerca(tope, 988.0914, 0.0001))
  check('sueldo sobre el tope paga lo mismo', calcularINSSBrasil(60000, TASAS) === tope)
  check('sueldo muy alto no supera el tope', calcularINSSBrasil(1e6, TASAS) === tope)
}

console.log('\n[IRRF — base legal vs descuento simplificado, sin dependientes]')
{
  // Sueldo alto: el INSS topado (988,09) deduce más que el descuento
  // simplificado (607,20), así que gana la base legal.
  const alto = calcularIRRFBrasil(20000, calcularINSSBrasil(20000, TASAS), TASAS)
  check('sueldo alto elige deducciones legales', alto.metodo === 'legal')
  check(
    'base legal = sueldo - INSS (sin deducción por dependientes)',
    cerca(alto.baseIRRF, 20000 - calcularINSSBrasil(20000, TASAS), 0.0001),
  )

  // Sueldo medio: el descuento simplificado deduce más que el INSS.
  const sueldoBajo = 3000
  const inssBajo = calcularINSSBrasil(sueldoBajo, TASAS)
  const medio = calcularIRRFBrasil(sueldoBajo, inssBajo, TASAS)
  check(
    'la base simplificada es menor cuando 607,20 supera al INSS',
    607.2 > inssBajo && medio.baseSimplificada < medio.baseLegal,
  )
  check(
    'base simplificada = sueldo - 607,20',
    cerca(medio.baseSimplificada, sueldoBajo - 607.2, 0.0001),
  )
  check('empate en IRRF 0 se informa como deducciones legales',
    medio.irrfFinal === 0 && medio.metodo === 'legal')

  check('la firma de IRRF ya no acepta dependientes',
    calcularIRRFBrasil.length === 3)
}

console.log('\n[IRRF — elección automática del método más favorable]')
{
  for (const sueldo of [1621, 2500, 3000, 4000, 5000, 6000, 7350, 9000, 12000, 30000]) {
    const inss = calcularINSSBrasil(sueldo, TASAS)
    const r = calcularIRRFBrasil(sueldo, inss, TASAS)

    // Fuerza cada método por separado: el elegido nunca deja más IRRF.
    const soloLegal = calcularIRRFBrasil(sueldo, inss, { ...TASAS, IRRF_DESCUENTO_SIMPLIFICADO: 0 })
    const soloSimplificado = calcularIRRFBrasil(sueldo, 0, TASAS)
    const alternativa = Math.min(soloLegal.irrfFinal, soloSimplificado.irrfFinal)
    check(
      `${brl(sueldo)} → ${r.metodo}, IRRF ${brl(r.irrfFinal)} (≤ alternativa)`,
      r.irrfFinal <= alternativa + 1e-9,
    )
  }
}

console.log('\n[Reducción IRRF 2026 — límites exactos]')
{
  const red = (sueldo) => {
    const inss = calcularINSSBrasil(sueldo, TASAS)
    return calcularIRRFBrasil(sueldo, inss, TASAS)
  }

  const a = red(5000.0)
  check(
    'R$ 5.000,00 → reducción total, min(312,89 ; IRRF bruto)',
    cerca(a.reduccion, Math.min(312.89, a.irrfBruto), 0.0001),
  )

  const b = red(5000.01)
  const parcialB = 978.62 - 0.133145 * 5000.01
  check(
    'R$ 5.000,01 → reducción parcial por fórmula',
    cerca(b.reduccion, Math.min(b.irrfBruto, parcialB), 0.0001),
  )
  check('el salto en R$ 0,01 no invierte la reducción', b.reduccion <= a.reduccion + 0.01)

  const c = red(7350.0)
  const parcialC = 978.62 - 0.133145 * 7350.0
  check(
    `R$ 7.350,00 → reducción ≈ ${brl(parcialC)} (casi nula, aún dentro del tramo)`,
    cerca(c.reduccion, Math.max(0, Math.min(c.irrfBruto, parcialC)), 0.0001),
  )

  const d = red(7350.01)
  check('sobre R$ 7.350,00 → reducción = 0', d.reduccion === 0)
  check('sobre el límite, IRRF final = IRRF bruto', cerca(d.irrfFinal, d.irrfBruto, 0.0001))

  const e = red(30000)
  check('sueldo alto → sin reducción', e.reduccion === 0)
  check('la reducción nunca deja IRRF negativo', red(4700).irrfFinal >= 0)
}

console.log('\n[Reducción calculada sobre el bruto, no sobre la base IRRF]')
{
  // Con sueldo 5.000 la base IRRF es < 5.000, pero la reducción total aplica
  // igual porque se evalúa contra el sueldo bruto.
  const r = calcularIRRFBrasil(5000, calcularINSSBrasil(5000, TASAS), TASAS)
  check('sueldo 5.000 usa el tramo de reducción total', r.baseIRRF < 5000 && r.reduccion > 0)

  // Sueldo 7.400: base IRRF cae bajo 7.350 pero no hay reducción.
  const r2 = calcularIRRFBrasil(7400, calcularINSSBrasil(7400, TASAS), TASAS)
  check('sueldo 7.400 no recibe reducción pese a base IRRF menor', r2.baseIRRF < 7350 && r2.reduccion === 0)
}

console.log('\n[Costo empresa — caso obligatorio R$ 25.500,00]')
{
  const e = calcularCostoEmpresaBrasil(25500, TASAS)
  check(`total de encargos = ${brl(e.totalEncargos)}`, mostrado(e.totalEncargos) === 9001.5)
  check(`total de provisiones = ${brl(e.totalProvisiones)}`, mostrado(e.totalProvisiones) === 4958.33)
  check(`costo empresa mensual = ${brl(e.costoEmpresaMensual)}`, mostrado(e.costoEmpresaMensual) === 39459.83)
  check(`costo empresa anual = ${brl(e.costoEmpresaAnual)}`, mostrado(e.costoEmpresaAnual) === 473518.0)

  check('sin redondeo intermedio en las provisiones', e.adicionalTercioVacaciones !== 708.33)
  check('provisiones = 13° + vacaciones + 1/3', cerca(
    e.totalProvisiones,
    e.provision13 + e.provisionVacaciones + e.adicionalTercioVacaciones,
    1e-9,
  ))
  check('no hay cargas sobre las provisiones', cerca(
    e.costoEmpresaMensual,
    25500 + e.totalEncargos + e.totalProvisiones,
    1e-9,
  ))

  const r = calc('base_a_liquido', 25500)
  check('el resultado de la vista trae el mismo costo mensual', cerca(r.costoTotalEmpresa, e.costoEmpresaMensual, 1e-9))
  check('el resultado de la vista trae el mismo costo anual', cerca(r.costoTotalEmpresaAnual, e.costoEmpresaAnual, 1e-9))
  check('FAP = 1 deja el RAT igual al modelo del Excel', cerca(e.rat, 25500 * 0.015, 1e-9))
}

console.log('\n[Conversión base → líquido → base]')
{
  for (const base of [1621, 2000, 2902.84, 3500, 4354.27, 5000, 5000.01, 7350, 8475.55, 12000, 25500, 25500.5, 90000]) {
    const ida = calc('base_a_liquido', base)
    const vuelta = calc('liquido_a_base', ida.sueldoLiquido)
    check(
      `${brl(base)} → líquido ${brl(ida.sueldoLiquido)} → base ${brl(vuelta.sueldoBase)}`,
      cerca(vuelta.sueldoBase, base, 0.01),
    )
  }
}

console.log('\n[Conversión líquido → base → líquido]')
{
  for (const liquido of [1600, 2500, 3000, 4000, 4500, 5000, 6000, 8000, 18679.86, 20000, 60000]) {
    const base = resolverBaseParaLiquidoBrasil(liquido, TASAS)
    const r = calc('base_a_liquido', base)
    check(
      `líquido ${brl(liquido)} → base ${brl(base)} → líquido ${brl(r.sueldoLiquido)}`,
      cerca(r.sueldoLiquido, liquido, 0.01),
    )
  }

  for (const liquido of [4700, 4750, 4800, 6500, 6600, 6700]) {
    const base = resolverBaseParaLiquidoBrasil(liquido, TASAS)
    check(
      `quiebre: líquido ${brl(liquido)} converge a ≤ R$ 0,01`,
      cerca(calc('base_a_liquido', base).sueldoLiquido, liquido, 0.01),
    )
  }
}

console.log('\n[Centavos — ida y vuelta con decimales]')
{
  for (const base of [25500.5, 1621.01, 4354.33, 7350.07, 12345.67, 0.01 + 1621]) {
    const ida = calc('base_a_liquido', base)
    const vuelta = calc('liquido_a_base', ida.sueldoLiquido)
    check(
      `centavos: ${brl(base)} → ${brl(ida.sueldoLiquido)} → ${brl(vuelta.sueldoBase)}`,
      cerca(vuelta.sueldoBase, base, 0.01),
    )
  }
  const conCentavos = calc('base_a_liquido', 25500.5)
  const sinCentavos = calc('base_a_liquido', 25500)
  check('los centavos no se pierden en el cálculo',
    conCentavos.sueldoLiquido !== sinCentavos.sueldoLiquido)
  check('los centavos llegan al costo empresa',
    conCentavos.costoTotalEmpresa > sinCentavos.costoTotalEmpresa)
}

console.log('\n[Validación: líquido bajo el salario mínimo]')
{
  const r = calc('liquido_a_base', 1200)
  check('líquido muy bajo devuelve error', typeof r.configError === 'string')
  check('el error menciona el salario mínimo', /salario mínimo/i.test(r.configError))
  check('no entrega costo empresa engañoso', r.costoTotalEmpresaAnual === 0)

  // El líquido de un sueldo base igual al mínimo sí es válido.
  const minimoLiquido = calc('base_a_liquido', 1621).sueldoLiquido
  const ok = calc('liquido_a_base', minimoLiquido)
  check('el líquido del salario mínimo exacto es válido', ok.configError === null)
  check('y resuelve la base al mínimo', cerca(ok.sueldoBase, 1621, 0.01))
}

console.log('\n[Configuración Brasil incompleta]')
{
  check('la lista de factores obligatorios tiene 15 claves', FACTORES_BRASIL.length === 15)
  check('IRRF_DEDUCCION_DEPENDIENTE ya no es obligatoria',
    !FACTORES_BRASIL.includes('IRRF_DEDUCCION_DEPENDIENTE'))
  for (const opcional of ['RAT_FAP', 'PROVISION_13_DIVISOR',
                          'PROVISION_VACACIONES_DIVISOR', 'ADICIONAL_VACACIONES_DIVISOR']) {
    check(`${opcional} es opcional, no obligatoria`, !FACTORES_BRASIL.includes(opcional))
  }
  check('config completa no reporta faltantes', factoresBrasilFaltantes(TASAS).length === 0)

  for (const clave of FACTORES_BRASIL) {
    const parcial = { ...TASAS }
    delete parcial[clave]
    const r = calc('base_a_liquido', 25500, { tasas: parcial })
    check(
      `falta ${clave} → error de configuración`,
      typeof r.configError === 'string' &&
        r.configError.includes('Configuración de Brasil incompleta') &&
        r.configError.includes(clave),
    )
  }

  const vacio = calc('base_a_liquido', 25500, { tasas: {} })
  check('sin tasas no calcula nada', vacio.costoTotalEmpresa === 0 && vacio.sueldoLiquido === 0)
  check('sin config tampoco calcula el líquido', calc('liquido_a_base', 5000, { tasas: {} }).sueldoBase === 0)

  const tramosVacios = calc('base_a_liquido', 25500, { tasas: { ...TASAS, IRRF_TRAMOS: [] } })
  check('tramos vacíos cuentan como faltantes', /IRRF_TRAMOS/.test(tramosVacios.configError))
}

console.log('\n[Defaults estructurales: config anterior a la migración]')
{
  // Una configuración sin las cuatro claves nuevas debe seguir calculando
  // exactamente el modelo del Excel, no bloquearse.
  const VIEJA = { ...TASAS }
  for (const k of ['RAT_FAP', 'PROVISION_13_DIVISOR',
                   'PROVISION_VACACIONES_DIVISOR', 'ADICIONAL_VACACIONES_DIVISOR']) {
    delete VIEJA[k]
  }

  check('config anterior no reporta faltantes', factoresBrasilFaltantes(VIEJA).length === 0)

  const vieja = calcularCostoEmpresaBrasil(25500, VIEJA)
  const nueva = calcularCostoEmpresaBrasil(25500, TASAS)
  check('mismo total de encargos', vieja.totalEncargos === nueva.totalEncargos)
  check('mismo total de provisiones', vieja.totalProvisiones === nueva.totalProvisiones)
  check('mismo costo mensual', vieja.costoEmpresaMensual === nueva.costoEmpresaMensual)
  check('mismo costo anual', vieja.costoEmpresaAnual === nueva.costoEmpresaAnual)
  check(`sigue dando el caso del Excel (${brl(vieja.costoEmpresaAnual)})`,
    mostrado(vieja.costoEmpresaAnual) === 473518.0)

  check('el cálculo completo tampoco se bloquea',
    calc('base_a_liquido', 25500, { tasas: VIEJA }).configError === null)

  const defaults = conDefaultsBrasil(VIEJA)
  check('FAP por defecto = 1 (sin FAP)', defaults.RAT_FAP === 1)
  check('provisión 13º por defecto = MESES_ANIO', defaults.PROVISION_13_DIVISOR === 12)
  check('provisión vacaciones por defecto = MESES_ANIO',
    defaults.PROVISION_VACACIONES_DIVISOR === 12)
  check('adicional por defecto = 3', defaults.ADICIONAL_VACACIONES_DIVISOR === 3)

  // Pero siguen siendo configurables.
  const conFAP = calcularCostoEmpresaBrasil(25500, { ...TASAS, RAT_FAP: 2 })
  check('FAP = 2 duplica el RAT', cerca(conFAP.rat, nueva.rat * 2, 1e-9))
  check('FAP = 2 sube las cargas patronales', conFAP.totalEncargos > nueva.totalEncargos)
  check('FAP configurado llega al bono',
    cerca(tasaCargasPatronalesBrasil({ ...TASAS, RAT_FAP: 2 }), 0.353 + 0.015, 1e-9))
}

console.log('\n[Sueldo negativo y campo vacío]')
{
  const neg = calc('base_a_liquido', -1000)
  check('sueldo negativo devuelve error', /negativo/i.test(neg.configError))
  check('sueldo negativo no calcula costo', neg.costoTotalEmpresa === 0)
  check('líquido negativo también devuelve error', /negativo/i.test(calc('liquido_a_base', -50).configError))

  const cero = calc('base_a_liquido', 0)
  check('monto 0 devuelve ceros sin error', cero.configError === null && cero.costoTotalEmpresaAnual === 0)
}

console.log('\n[Sin dependientes: estabilidad de las conversiones]')
{
  check('calcularBrasil ya no recibe dependientes',
    calc('base_a_liquido', 12000).dependientes === undefined)
  check('resolverBaseParaLiquidoBrasil toma (liquido, tasas)',
    resolverBaseParaLiquidoBrasil.length === 2)

  // La estabilidad no depende de ningún parámetro personal: mismo insumo,
  // mismo resultado, y la ida y vuelta sigue cerrando al centavo.
  const a = calc('base_a_liquido', 12000)
  const b = calc('base_a_liquido', 12000)
  check('el cálculo es determinista', a.sueldoLiquido === b.sueldoLiquido)
  check('ida y vuelta estable sin dependientes',
    cerca(calc('liquido_a_base', a.sueldoLiquido).sueldoBase, 12000, 0.01))
}

console.log('\n[Parser BRL]')
{
  const casos = [
    ['25.500', 25500],
    ['25.500,50', 25500.5],
    ['25500,50', 25500.5],
    ['25500.50', 25500.5],
    ['R$ 0,01', 0.01],
    ['', 0],
    ['abc', 0],
    ['1.234.567,89', 1234567.89],
  ]
  for (const [entrada, esperado] of casos) {
    check(`parseBRLInput(${JSON.stringify(entrada)}) = ${esperado}`,
      parseBRLInput(entrada) === esperado)
  }
  check('formatBRLInput normaliza al perder foco', formatBRLInput('25500.5') === '25.500,50')
  check('formatBRLInput deja vacío el campo vacío', formatBRLInput('') === '')
  check('Chile y Perú siguen con el parser de enteros',
    parseNumericInput('1.000.000') === 1000000 && parseNumericInput('3.500') === 3500)

  // El sueldo escrito con separadores brasileños llega intacto al cálculo.
  const r = calc('base_a_liquido', parseBRLInput('25.500,50'))
  check('sueldo "25.500,50" produce base R$ 25.500,50', mostrado(r.sueldoBase) === 25500.5)
}

console.log('\n[Bono empresa anual]')
{
  const cargas = tasaCargasPatronalesBrasil(TASAS)
  check('tasa de cargas = INSS + RAT×FAP + terceros + FGTS', cerca(cargas, 0.353, 1e-9))

  const sinBono = calc('base_a_liquido', 25500)
  const conBono = calcConBono('base_a_liquido', 25500, 10000, 0, true)

  check('el bono no cambia el sueldo líquido mensual',
    conBono.sueldoLiquido === sinBono.sueldoLiquido)
  check('el bono no cambia el costo empresa mensual',
    conBono.costoTotalEmpresa === sinBono.costoTotalEmpresa)
  check('el bono no cambia las provisiones',
    conBono.totalProvisiones === sinBono.totalProvisiones)
  check('el bono no entra a los haberes mensuales',
    conBono.totalHaberes === sinBono.totalHaberes)

  check('bono imponible: cargas = bono × 35,3%', cerca(conBono.bonoEmpresaBrasil.cargas, 3530, 1e-9))
  check('bono imponible: costo = bono + cargas',
    cerca(conBono.bonoEmpresaBrasil.costoEmpresa, 13530, 1e-9))
  check('el costo anual sube exactamente el costo del bono',
    cerca(conBono.costoTotalEmpresaAnual, sinBono.costoTotalEmpresaAnual + 13530, 1e-9))
  check('costoEmpresaAnualSinBono conserva el anual del Excel',
    cerca(conBono.costoEmpresaAnualSinBono, sinBono.costoTotalEmpresaAnual, 1e-9))

  const noImponible = calcConBono('base_a_liquido', 25500, 10000, 0, false)
  check('bono no imponible: sin cargas', noImponible.bonoEmpresaBrasil.cargas === 0)
  check('bono no imponible: costo = monto', noImponible.bonoEmpresaBrasil.costoEmpresa === 10000)
  check('bono no imponible suma sólo el monto al anual',
    cerca(noImponible.costoTotalEmpresaAnual, sinBono.costoTotalEmpresaAnual + 10000, 1e-9))

  // Como porcentaje del sueldo base.
  const porcentaje = calcConBono('base_a_liquido', 25500, 0, 1.5, true)
  check('bono por porcentaje: 1,5 sueldos base', cerca(porcentaje.bonoEmpresaBrasil.monto, 38250, 1e-9))
  check('bono por porcentaje también suma cargas',
    cerca(porcentaje.bonoEmpresaBrasil.costoEmpresa, 38250 * 1.353, 1e-8))

  // En modo líquido → base el bono no debe alterar la resolución de la base.
  const liqSinBono = calc('liquido_a_base', 18679.86)
  const liqConBono = calcConBono('liquido_a_base', 18679.86, 10000, 0, true)
  check('el bono no altera la conversión líquido → base',
    cerca(liqConBono.sueldoBase, liqSinBono.sueldoBase, 1e-9))

  check('sin bono no hay costo de bono', sinBono.bonoEmpresaBrasil.costoEmpresa === 0)
  check('bono negativo se trata como 0',
    calcConBono('base_a_liquido', 25500, -500, 0, true).bonoEmpresaBrasil.monto === 0)

  const directo = calcularBonoEmpresaBrasil(1000, true, TASAS)
  check('calcularBonoEmpresaBrasil es reutilizable', cerca(directo.costoEmpresa, 1353, 1e-9))
}

console.log('\n[Brasil no cae en lógica de Chile ni Perú]')
{
  const r = calc('base_a_liquido', 25500)
  check('sin gratificación chilena', r.gratificacion === 0)
  check('sin cotización de salud chilena', r.cotizacionSalud === 0)
  check('sin cesantía', r.cesantia === 0 && r.cesantiaEmpleador === 0)
  check('sin mutual / SIS / expectativa de vida', r.mutual === 0 && r.sis === 0 && r.expectativaVida === 0)
  check('sin bonos anuales de Chile', r.bonoNavidad.costoEmpresa === 0 && r.bonoEscolaridad.costoEmpresa === 0)
  check('sin EsSalud ni gratificaciones de Perú', r.essaludEmpleador === 0 && r.gratificacionesAnual === 0)
  check('sin refrigerio peruano', r.refrigerio === 0)
  check('descuentos = INSS + IRRF, nada más', cerca(r.totalDescuentos, r.inssTrabajador + r.irrfFinal, 1e-9))
  check('el costo anual es exactamente mensual × 12', cerca(r.costoTotalEmpresaAnual, r.costoTotalEmpresa * 12, 1e-9))
}

console.log('\n[No regresión de Chile y Perú]')
{
  const CONFIG_CHILE = {
    afpData: { Uno: 0.1049 },
    ufValue: 38000,
    dolarValue: 950,
    taxBrackets: [{ desde: 0, hasta: 900000, tasa: 0, rebaja: 0 }],
    bonosAnualesUF: { navidad: 7, escolaridad: 3, fiestaPatrias: 6 },
    bonosEmpresa: [],
    tasas: {
      TASA_SALUD_FONASA: 0.07, TASA_CESANTIA: 0.006, TOPE_AFP_SALUD_UF: 89.9,
      TOPE_CESANTIA_UF: 135.1, GRATIFICACION_MAX_IMM: 4.75, SUELDO_MINIMO: 539000,
      CESANTIA_EMPLEADOR: 0.024, MUTUAL: 0.0093, SIS: 0.0154, EXPECTATIVA_VIDA: 0.009,
      AFP_EMPLEADOR: 0.001, SEGURO_COMPLEMENTARIO_UF: 0.4822,
    },
  }
  const CONFIG_PERU = {
    afpData: { Integra: 0.0155 },
    ufValue: 1,
    dolarValue: 3.4198,
    taxBrackets: [],
    bonosAnualesUF: { navidad: 7, escolaridad: 3, fiestaPatrias: 6 },
    bonosEmpresa: [],
    tasas: {
      UIT: 5500, SUELDO_MINIMO: 1130, TASA_AFP_OBLIGATORIA: 0.1,
      TASA_SEGUROS_INVALIDEZ: 0.0137, TASA_SALUD_PATRONAL: 0.09, REFRIGERIO: 300,
      SUELDOS_ANUALES: 14, DEDUCCION_FIJA_UIT: 7,
      TRAMOS_IMPUESTO: [
        { desde_uf: 0, hasta_uf: 5, tasa: 0.08 },
        { desde_uf: 5, hasta_uf: 20, tasa: 0.14 },
        { desde_uf: 20, hasta_uf: 35, tasa: 0.17 },
        { desde_uf: 35, hasta_uf: 45, tasa: 0.2 },
        { desde_uf: 45, hasta_uf: null, tasa: 0.3 },
      ],
    },
  }

  // Con el nuevo parámetro `dependientes` presente y ausente el resultado es idéntico.
  const cl = calcularRemuneracion('base_a_liquido', 1500000, 'Uno', 'fonasa', 0, 40000, 0, 0, [], 'chile', CONFIG_CHILE)
  const clConFlag = calcularRemuneracion('base_a_liquido', 1500000, 'Uno', 'fonasa', 0, 40000, 0, 0, [], 'chile', CONFIG_CHILE, true)
  check('Chile: costo anual > 0', cl.costoTotalEmpresaAnual > 0)
  check('Chile: el flag de bono imponible Brasil es inerte', cl.costoTotalEmpresaAnual === clConFlag.costoTotalEmpresaAnual)
  check('Chile: líquido sin cambios', cl.sueldoLiquido === clConFlag.sueldoLiquido)
  check('Chile: sin campos Brasil', cl.inssTrabajador === undefined && cl.configError === undefined)
  check('Chile: bonos anuales intactos', cl.bonoNavidad.costoEmpresa > 0)

  const pe = calcularRemuneracion('base_a_liquido', 3500, 'Integra', 'essalud', 0, 0, 0, 0, [], 'peru', CONFIG_PERU)
  const peConFlag = calcularRemuneracion('base_a_liquido', 3500, 'Integra', 'essalud', 0, 0, 0, 0, [], 'peru', CONFIG_PERU, true)
  check('Perú: costo anual > 0', pe.costoTotalEmpresaAnual > 0)
  check('Perú: el flag de bono imponible Brasil es inerte', pe.costoTotalEmpresaAnual === peConFlag.costoTotalEmpresaAnual)
  check('Perú: EsSalud y gratificaciones intactos', pe.essaludEmpleador > 0 && pe.gratificacionesAnual > 0)
  check('Perú: sin campos Brasil', pe.inssTrabajador === undefined && pe.configError === undefined)

  const clLiq = calcularRemuneracion('liquido_a_base', 1000000, 'Uno', 'fonasa', 0, 40000, 0, 0, [], 'chile', CONFIG_CHILE)
  check('Chile: modo líquido → base sigue convergiendo', Math.abs(clLiq.sueldoLiquido - 1000000) < 1)
}

console.log('\nTodo OK\n')
