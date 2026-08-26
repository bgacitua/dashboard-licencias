/**
 * Self-check de calculations.js: verifica que los tres ítems Perú entran al
 * Costo Empresa Anual y que Chile/Brasil no cambian.
 *
 * Ejecutar:  node src/features/calculadora/lib/calculations.selfcheck.mjs
 */

import assert from 'node:assert/strict'
import {
  calcularRemuneracion,
  aplicarExtrasPeru,
  calcularAportesPatronalesPeru,
} from './calculations.js'

const CONFIG_PERU = {
  afpData: { Integra: 0.0155 },
  ufValue: 1,
  dolarValue: 3.4198,
  taxBrackets: [],
  bonosAnualesUF: { navidad: 7, escolaridad: 3, fiestaPatrias: 6 },
  bonosEmpresa: [],
  tasas: {
    UIT: 5500,
    SUELDO_MINIMO: 1130,
    TASA_AFP_OBLIGATORIA: 0.1,
    TASA_SEGUROS_INVALIDEZ: 0.0137,
    TASA_SALUD_PATRONAL: 0.09,
    REFRIGERIO: 300,
    SUELDOS_ANUALES: 14,
    DEDUCCION_FIJA_UIT: 7,
    TRAMOS_IMPUESTO: [
      { desde_uf: 0, hasta_uf: 5, tasa: 0.08 },
      { desde_uf: 5, hasta_uf: 20, tasa: 0.14 },
      { desde_uf: 20, hasta_uf: 35, tasa: 0.17 },
      { desde_uf: 35, hasta_uf: 45, tasa: 0.2 },
      { desde_uf: 45, hasta_uf: null, tasa: 0.3 },
    ],
  },
}

const APORTES_PATRONALES = [
  { id: 'eps',          nombre: 'EPS',          tipo: 'porcentaje',          tasa: 0.0225, base: 'imponible', activo: true },
  { id: 'essalud',      nombre: 'EsSalud',      tipo: 'porcentaje',          tasa: 0.0675, base: 'imponible', activo: true },
  { id: 'sctr_salud',   nombre: 'SCTR Salud',   tipo: 'porcentaje',          tasa: 0.007,  base: 'imponible', activo: true },
  { id: 'sctr_pension', nombre: 'SCTR Pensión', tipo: 'porcentaje_con_tope', tasa: 0.007,  base: 'imponible', tope: 12598.57, activo: true },
  { id: 'vida_ley',     nombre: 'Vida Ley',     tipo: 'porcentaje_con_tope', tasa: 0.0027, base: 'imponible', tope: 12600,    activo: true },
]

const CONFIG_PERU_APORTES = {
  ...CONFIG_PERU,
  tasas: { ...CONFIG_PERU.tasas, APORTES_PATRONALES },
}

const CONFIG_CHILE = {
  afpData: { Uno: 0.1049 },
  ufValue: 38000,
  dolarValue: 950,
  taxBrackets: [{ desde: 0, hasta: 900000, tasa: 0, rebaja: 0 }],
  bonosAnualesUF: { navidad: 7, escolaridad: 3, fiestaPatrias: 6 },
  bonosEmpresa: [],
  tasas: {
    TASA_SALUD_FONASA: 0.07,
    TASA_CESANTIA: 0.006,
    TOPE_AFP_SALUD_UF: 89.9,
    TOPE_CESANTIA_UF: 135.1,
    GRATIFICACION_MAX_IMM: 4.75,
    SUELDO_MINIMO: 539000,
    CESANTIA_EMPLEADOR: 0.024,
    MUTUAL: 0.0093,
    SIS: 0.0154,
    EXPECTATIVA_VIDA: 0.009,
    AFP_EMPLEADOR: 0.001,
    SEGURO_COMPLEMENTARIO_UF: 0.4822,
  },
}

const EXTRAS = {
  reparto_utilidades_estimado: 12345.67,
  asignacion_familiar_anual: 1582,
  canasta_navidena_anual: 200,
}

const check = (nombre, cond) => {
  assert.ok(cond, `FALLO: ${nombre}`)
  console.log(`  ok  ${nombre}`)
}

const peru = (modo = 'base_a_liquido', monto = 3500) =>
  calcularRemuneracion(modo, monto, 'Integra', 'essalud', 0, 0, 0, 0, [], 'peru', CONFIG_PERU)

const chile = (modo = 'base_a_liquido', monto = 1500000) =>
  calcularRemuneracion(modo, monto, 'Uno', 'fonasa', 0, 40000, 0, 0, [], 'chile', CONFIG_CHILE)

console.log('\n[Perú — los tres ítems entran al Costo Empresa Anual]')
{
  const base = peru()
  const final = aplicarExtrasPeru(base, EXTRAS)
  const esperado = base.costoTotalEmpresaAnual + 12346 + 1582 + 200

  check('reparto de utilidades expuesto', final.repartoUtilidades === 12346)
  check('asignación familiar anual expuesta', final.asignacionFamiliarAnual === 1582)
  check('canasta navideña expuesta', final.canastaNavidena === 200)
  check('costo empresa anual suma los tres ítems', final.costoTotalEmpresaAnual === esperado)
  check(
    'el detalle anual existente sigue visible (gratificaciones)',
    final.gratificacionesCostoAnual === base.gratificacionesCostoAnual &&
      final.gratificacionesCostoAnual > 0,
  )
}

console.log('\n[Perú — nada más se toca]')
{
  const base = peru()
  const final = aplicarExtrasPeru(base, EXTRAS)
  const intactos = [
    'sueldoBase', 'sueldoLiquido', 'totalHaberes', 'totalDescuentos',
    'afpObligatorio', 'comisionAFP', 'seguroInvalidez', 'impuesto',
    'essaludEmpleador', 'costoTotalEmpresa', 'gratificacionesAnual',
  ]
  for (const k of intactos) {
    check(`${k} sin cambios`, final[k] === base[k])
  }
}

console.log('\n[Perú — ambos modos]')
{
  for (const modo of ['base_a_liquido', 'liquido_a_base']) {
    const base = peru(modo, 3500)
    const final = aplicarExtrasPeru(base, EXTRAS)
    check(
      `${modo}: sueldo base > 0 y extras aplicados`,
      base.sueldoBase > 0 &&
        final.costoTotalEmpresaAnual === base.costoTotalEmpresaAnual + 12346 + 1582 + 200,
    )
  }
}

console.log('\n[Perú — asignación familiar desactivada]')
{
  const base = peru()
  const sinAsignacion = aplicarExtrasPeru(base, { ...EXTRAS, asignacion_familiar_anual: 0 })
  check('asignación en 0 no suma', sinAsignacion.asignacionFamiliarAnual === 0)
  check(
    'total sólo suma utilidades + canasta',
    sinAsignacion.costoTotalEmpresaAnual === base.costoTotalEmpresaAnual + 12346 + 200,
  )
}

console.log('\n[Sin datos del backend / config incompleta]')
{
  const base = peru()
  check('extras null devuelve el mismo objeto', aplicarExtrasPeru(base, null) === base)
  check('extras undefined devuelve el mismo objeto', aplicarExtrasPeru(base) === base)
  const vacio = aplicarExtrasPeru(base, {})
  check(
    'extras vacío no altera el total',
    vacio.costoTotalEmpresaAnual === base.costoTotalEmpresaAnual,
  )
}

const peruCon = (config, monto = 3500) =>
  calcularRemuneracion('base_a_liquido', monto, 'Integra', 'essalud', 0, 0, 0, 0, [], 'peru', config)

console.log('\n[Perú — aportes patronales desde configuración]')
{
  const r = peruCon(CONFIG_PERU_APORTES)
  const imponible = r.totalHaberesImponibles
  const porId = Object.fromEntries(r.aportesPatronales.map((a) => [a.id, a]))

  check('se calculan los cinco aportes activos', r.aportesPatronales.length === 5)
  check('sin errores de configuración', r.erroresAportes.length === 0)

  // 1. EPS 2,25% + EsSalud 6,75% = 9% del imponible.
  check('EPS = 2,25% del imponible', porId.eps.monto === Math.round(imponible * 0.0225))
  check('EsSalud = 6,75% del imponible', porId.essalud.monto === Math.round(imponible * 0.0675))
  check(
    'EPS + EsSalud = 9% del imponible',
    Math.abs(porId.eps.monto + porId.essalud.monto - imponible * 0.09) <= 1,
  )

  const suma = r.aportesPatronales.reduce((s, a) => s + a.monto, 0)
  check('el subtotal es exactamente la suma de las filas', r.totalPatronal === suma)
  check('costo empresa = haberes + aportes', r.costoTotalEmpresa === Math.round(r.totalHaberes + suma))
}

console.log('\n[Perú — los aportes son costo de empresa, no del trabajador]')
{
  // Mismo esquema de salud (EPS presente) en ambos: sólo cambian los aportes
  // adicionales, así la comparación aísla su efecto.
  const soloSalud = {
    ...CONFIG_PERU,
    tasas: {
      ...CONFIG_PERU.tasas,
      APORTES_PATRONALES: APORTES_PATRONALES.filter((a) => a.id === 'eps' || a.id === 'essalud'),
    },
  }
  const con = peruCon(CONFIG_PERU_APORTES)
  const sin = peruCon(soloSalud)

  check('el sueldo base no cambia', con.sueldoBase === sin.sueldoBase)
  check('el líquido no cambia', con.sueldoLiquido === sin.sueldoLiquido)
  check('los descuentos del trabajador no cambian', con.totalDescuentos === sin.totalDescuentos)
  check('el costo empresa mensual sube', con.costoTotalEmpresa > sin.costoTotalEmpresa)
  check('el costo empresa anual sube', con.costoTotalEmpresaAnual > sin.costoTotalEmpresaAnual)
}

console.log('\n[Perú — topes de SCTR Pensión y Vida Ley]')
{
  const alto = peruCon(CONFIG_PERU_APORTES, 20000)
  const porId = Object.fromEntries(alto.aportesPatronales.map((a) => [a.id, a]))
  check('imponible por sobre los topes', alto.totalHaberesImponibles > 12600)
  check('SCTR Pensión se topa en 12.598,57', porId.sctr_pension.monto === Math.round(12598.57 * 0.007))
  check('Vida Ley se topa en 12.600', porId.vida_ley.monto === Math.round(12600 * 0.0027))
  check('SCTR Salud no tiene tope', porId.sctr_salud.monto === Math.round(alto.totalHaberesImponibles * 0.007))

  const bajo = peruCon(CONFIG_PERU_APORTES, 3500)
  const bajoId = Object.fromEntries(bajo.aportesPatronales.map((a) => [a.id, a]))
  check(
    'bajo el tope, SCTR Pensión usa el imponible',
    bajoId.sctr_pension.monto === Math.round(bajo.totalHaberesImponibles * 0.007),
  )
}

console.log('\n[Perú — bonificación extraordinaria sobre gratificaciones]')
{
  const conEps = peruCon(CONFIG_PERU_APORTES)
  check('con EPS la tasa es 6,75%', conEps.tasaBonifExtraordinaria === 0.0675)
  check(
    'bonificación = 6,75% de las gratificaciones',
    conEps.bonificacionExtraordinaria === Math.round(conEps.gratificacionesAnual * 0.0675),
  )
  check(
    'costo anual de gratificaciones = gratificaciones + bonificación',
    conEps.gratificacionesCostoAnual ===
      conEps.gratificacionesAnual + conEps.bonificacionExtraordinaria,
  )

  const sinEps = peruCon({
    ...CONFIG_PERU,
    tasas: {
      ...CONFIG_PERU.tasas,
      APORTES_PATRONALES: [
        { id: 'essalud', nombre: 'EsSalud', tipo: 'porcentaje', tasa: 0.09, base: 'imponible', activo: true },
      ],
    },
  })
  check('sin EPS la tasa es 9%', sinEps.tasaBonifExtraordinaria === 0.09)
}

console.log('\n[Perú — aportes inactivos y sin catálogo]')
{
  const inactivo = peruCon({
    ...CONFIG_PERU,
    tasas: {
      ...CONFIG_PERU.tasas,
      APORTES_PATRONALES: APORTES_PATRONALES.map((a) =>
        a.id === 'vida_ley' ? { ...a, activo: false } : a,
      ),
    },
  })
  check('el aporte inactivo no se muestra', inactivo.aportesPatronales.length === 4)
  check('ni suma al total', !inactivo.aportesPatronales.some((a) => a.id === 'vida_ley'))

  // Sin catálogo: regla histórica de EsSalud 9%, con advertencia.
  const legacy = peruCon(CONFIG_PERU)
  check('sin catálogo se aplica EsSalud 9%', legacy.aportesPatronales.length === 1)
  check(
    'el monto es 9% del imponible',
    legacy.totalPatronal === Math.round(legacy.totalHaberesImponibles * 0.09),
  )
  check('advierte que faltan los aportes detallados', /APORTES_PATRONALES/.test(legacy.erroresAportes[0]))
  check('sin EPS, la bonificación vuelve a 9%', legacy.tasaBonifExtraordinaria === 0.09)
}

console.log('\n[Perú — configuración inválida advierte y omite]')
{
  const casos = [
    [{ id: 'eps', nombre: 'EPS', tipo: 'porcentaje', tasa: 0.0225, activo: true },
     { id: 'eps', nombre: 'EPS duplicado', tipo: 'porcentaje', tasa: 0.5, activo: true }],
    [{ id: 'x', nombre: 'X', tipo: 'porcentaje_de_algo', tasa: 0.01, activo: true }],
    [{ id: 'x', nombre: 'X', tipo: 'porcentaje', tasa: -0.01, activo: true }],
    [{ id: 'x', nombre: 'X', tipo: 'monto_fijo', monto: -5, activo: true }],
    [{ id: 'x', nombre: 'X', tipo: 'porcentaje_con_tope', tasa: 0.01, activo: true }],
    [{ id: 'x', nombre: 'X', tipo: 'porcentaje_con_tope', tasa: 0.01, tope: 0, activo: true }],
    [{ id: 'x', nombre: 'X', tipo: 'porcentaje', tasa: 0.01, base: 'bruto_anual', activo: true }],
    [{ nombre: 'sin id', tipo: 'porcentaje', tasa: 0.01, activo: true }],
  ]
  const etiquetas = [
    'id repetido', 'tipo desconocido', 'tasa negativa', 'monto negativo',
    'tope ausente', 'tope no positivo', 'base no soportada', 'id ausente',
  ]
  casos.forEach((APORTES_PATRONALES, i) => {
    const r = calcularAportesPatronalesPeru(10000, { APORTES_PATRONALES })
    check(`${etiquetas[i]}: genera advertencia`, r.errores.length > 0)
    check(`${etiquetas[i]}: el aporte inválido no se calcula`, r.aportes.length < APORTES_PATRONALES.length)
  })

  // Advertir no puede significar entregar un total silenciosamente incorrecto.
  const mixto = calcularAportesPatronalesPeru(10000, {
    APORTES_PATRONALES: [
      { id: 'essalud', nombre: 'EsSalud', tipo: 'porcentaje', tasa: 0.0675, activo: true },
      { id: 'roto', nombre: 'Roto', tipo: 'porcentaje_con_tope', tasa: 0.007, activo: true },
    ],
  })
  check('el aporte válido sí se calcula', mixto.total === 675)
  check('y el roto queda reportado', mixto.errores.length === 1)

  const fijo = calcularAportesPatronalesPeru(10000, {
    APORTES_PATRONALES: [{ id: 'prima', nombre: 'Prima', tipo: 'monto_fijo', monto: 42, activo: true }],
  })
  check('monto_fijo se aplica tal cual', fijo.total === 42 && fijo.errores.length === 0)
}

console.log('\n[Chile / Brasil sin cambios funcionales]')
{
  const cl = chile()
  check('Chile: costo anual > 0', cl.costoTotalEmpresaAnual > 0)
  check('Chile: bonos anuales intactos', cl.bonoNavidad.costoEmpresa > 0)
  check('Chile: sin campos Perú', cl.repartoUtilidades === undefined)
  check('Chile: sin aportes patronales de Perú', cl.aportesPatronales.length === 0)
  check('Chile: sin bonificación extraordinaria', cl.bonificacionExtraordinaria === 0)
  check(
    'Chile: costo anual = mensual×12 + bonos',
    cl.costoTotalEmpresaAnual ===
      cl.costoTotalEmpresa * 12 +
        cl.bonoNavidad.costoEmpresa +
        cl.bonoFiestasPatrias.costoEmpresa +
        cl.bonoEscolaridad.costoEmpresa +
        cl.bonoEmpresaAnual.costoEmpresa,
  )
  check(
    'Chile nunca pasa por aplicarExtrasPeru (la página sólo lo llama con pais=peru)',
    aplicarExtrasPeru(cl, null) === cl,
  )

  // Brasil tiene su propia rama: con tasas de Chile devuelve configuración
  // incompleta en vez de calcular con lógica chilena.
  const br = calcularRemuneracion(
    'base_a_liquido', 1500000, 'Uno', 'fonasa', 0, 0, 0, 0, [], 'brasil', CONFIG_CHILE,
  )
  check('Brasil: no cae en la lógica de Chile', /Configuración de Brasil incompleta/.test(br.configError))
  check('Brasil: no produce costo empresa chileno', br.costoTotalEmpresaAnual === 0)
  check('Brasil: sin campos Perú', br.repartoUtilidades === undefined)
  check('Brasil: sin aportes patronales de Perú', br.aportesPatronales.length === 0)
  check('Brasil: aplicarExtrasPeru no se le aplica', aplicarExtrasPeru(br, null) === br)
}

console.log('\nTodo OK\n')
