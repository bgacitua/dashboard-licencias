/**
 * Self-check de calculations.js: verifica que CTS y los extras Perú entran al
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
    ASIGNACION_FAMILIAR_PCT: 0.1,
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

console.log('\n[Perú — CTS y extras entran al Costo Empresa Anual]')
{
  const base = peru()
  const final = aplicarExtrasPeru(base, EXTRAS)

  check('reparto de utilidades en pausa: siempre 0', final.repartoUtilidades === 0)
  check('asignación familiar anual no se suma (ya está en el mensual)',
        final.asignacionFamiliarAnual === 0)
  check('canasta navideña expuesta', final.canastaNavidena === 200)
  check('costo empresa anual sólo suma la canasta',
        final.costoTotalEmpresaAnual === base.costoTotalEmpresaAnual + 200)
  check(
    'el detalle anual existente sigue visible (gratificaciones)',
    final.gratificacionesCostoAnual === base.gratificacionesCostoAnual &&
      final.gratificacionesCostoAnual > 0,
  )
}

console.log('\n[Perú — CTS anual]')
{
  for (const modo of ['base_a_liquido', 'liquido_a_base']) {
    const base = peru(modo, 3500)
    const ctsEsperada = Math.round(base.totalHaberesImponibles + base.gratificacionesAnual / 12)
    const anualEsperado =
      base.costoTotalEmpresa * 12 +
      base.gratificacionesCostoAnual +
      ctsEsperada +
      base.bonoEmpresaAnual.costoEmpresa

    check(`${modo}: CTS = remuneración computable + 1/6 de gratificaciones`,
          base.ctsAnual === ctsEsperada)
    check(`${modo}: gratificaciones = 2 remuneraciones computables`,
          base.gratificacionesAnual === base.totalHaberesImponibles * 2)
    check(`${modo}: CTS entra una sola vez al costo anual`, base.costoTotalEmpresaAnual === anualEsperado)
    const desdeBase = peru('base_a_liquido', base.sueldoBase)
    check(
      `${modo}: CTS no altera líquido, descuentos ni costo mensual`,
      desdeBase.sueldoLiquido === Math.round(desdeBase.totalHaberes - desdeBase.totalDescuentos) &&
        desdeBase.totalDescuentos === base.totalDescuentos &&
        desdeBase.costoTotalEmpresa === Math.round(desdeBase.totalHaberes + desdeBase.totalPatronal),
    )
  }
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
        final.costoTotalEmpresaAnual === base.costoTotalEmpresaAnual + 200,
    )
  }
}

console.log('\n[Perú — asignación familiar mensual]')
{
  const conAsignacion = (modo = 'base_a_liquido', monto = 3500) =>
    calcularRemuneracion(modo, monto, 'Integra', 'essalud', 0, 0, 0, 0, [], 'peru',
                         CONFIG_PERU, false, true)

  const sin = peru()
  const con = conAsignacion()

  check('sin marcar la casilla no hay asignación', sin.asignacionFamiliar === 0)
  check('marcada = 10% de la RMV (1130 → 113)', con.asignacionFamiliar === 113)
  check('entra a Total Haberes mensual', con.totalHaberes === sin.totalHaberes + 113)
  check('es imponible: sube la base de AFP', con.afpObligatorio > sin.afpObligatorio)
  check('sube el líquido, pero menos que los 113 (paga AFP e impuesto)',
        con.sueldoLiquido > sin.sueldoLiquido && con.sueldoLiquido < sin.sueldoLiquido + 113)
  check('es computable para gratificaciones',
        con.gratificacionesAnual === sin.gratificacionesAnual + 113 * 2)
  check('es computable para la CTS',
        con.ctsAnual === Math.round(sin.ctsAnual + 113 + 113 * 2 / 12))
  check('no se cuenta dos veces en el costo anual',
        aplicarExtrasPeru(con, EXTRAS).costoTotalEmpresaAnual === con.costoTotalEmpresaAnual + 200)

  const inv = conAsignacion('liquido_a_base', 3000)
  check('líquido→base: con asignación se necesita menos sueldo base',
        inv.sueldoBase < peru('liquido_a_base', 3000).sueldoBase)
  check('líquido→base: el líquido objetivo se respeta', inv.sueldoLiquido === 3000)
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
  check('Chile: CTS en 0', cl.ctsAnual === 0)
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
  check('Brasil: CTS en 0', br.ctsAnual === 0)
  check('Brasil: sin aportes patronales de Perú', br.aportesPatronales.length === 0)
  check('Brasil: aplicarExtrasPeru no se le aplica', aplicarExtrasPeru(br, null) === br)
}

// El bono empresa es renta extraordinaria: se retiene en su mes de pago, así que
// no puede mover el líquido mensual ni —en modo líquido→base— el sueldo base.
console.log()
console.log('[Perú — el bono empresa no altera sueldo base ni líquido]')
{
  const conBono = (bonoMonto, bonoTasa, modo = 'base_a_liquido', monto = 8000) =>
    calcularRemuneracion(modo, monto, 'Integra', 'essalud', 0, 0,
                         bonoMonto, bonoTasa, [], 'peru', CONFIG_PERU_APORTES)

  const sinBono = conBono(0, 0)
  const sinBonoInv = conBono(0, 0, 'liquido_a_base', 6000)
  for (const [bm, bt, etiqueta] of [[10000, 0, 'monto fijo'], [0, 1, 'tasa 1 sueldo'], [0, 2, 'tasa 2 sueldos']]) {
    const r = conBono(bm, bt)
    check(`base→líquido: ${etiqueta} no cambia el líquido`, r.sueldoLiquido === sinBono.sueldoLiquido)
    check(`base→líquido: ${etiqueta} no cambia el impuesto mensual`, r.impuesto === sinBono.impuesto)
    check(`base→líquido: ${etiqueta} no cambia el costo empresa mensual`,
          r.costoTotalEmpresa === sinBono.costoTotalEmpresa)
    check(`líquido→base: ${etiqueta} no cambia el sueldo base`,
          conBono(bm, bt, 'liquido_a_base', 6000).sueldoBase === sinBonoInv.sueldoBase)
  }

  // Pero el bono sí paga su propio impuesto de 5ta, retenido en el mes de pago.
  const conMonto = conBono(10000, 0)
  check('el bono declara su impuesto 5ta cat.', conMonto.bonoEmpresaAnual.descuentoTrabajador > 0)
  check('sin bono no hay impuesto asociado', sinBono.bonoEmpresaAnual.descuentoTrabajador === 0)
  check('el impuesto del bono no supera su monto',
        conMonto.bonoEmpresaAnual.descuentoTrabajador < conMonto.bonoEmpresaAnual.montoImponible)
  check('el bono sí entra al costo empresa anual',
        conMonto.costoTotalEmpresaAnual === sinBono.costoTotalEmpresaAnual + 10000)
}

// Impuesto de 5ta categoría: el número contra el cálculo a mano, y que el orden
// en que venga TRAMOS_IMPUESTO desde la BD no cambie el resultado.
console.log()
console.log('[Perú — impuesto de 5ta categoría]')
{
  // Base 5000 con refrigerio 300 (computable) y EsSalud 9% (CONFIG_PERU sin catálogo):
  //   remuneración   = 5000 + 300 = 5300, que se paga 14 veces
  //   renta ordinaria = 5300×14 + (5300×2)×9% = 74200 + 954 = 75154
  //   renta neta      = 75154 − 7×5500 = 36654
  //   impuesto        = 5×5500×8% + (36654 − 27500)×14% = 2200 + 1281,56 = 3481,56 al año
  const r = peru('base_a_liquido', 5000)
  check('coincide con el cálculo a mano: 3481,56/año → 290/mes', r.impuesto === 290)

  // Bajo las 7 UIT proyectadas no hay retención.
  check('renta anual bajo 7 UIT no retiene', peru('base_a_liquido', 2000).impuesto === 0)

  // El orden de los tramos en la BD no es contrato: se ordenan antes de aplicar.
  const alReves = {
    ...CONFIG_PERU,
    tasas: { ...CONFIG_PERU.tasas, TRAMOS_IMPUESTO: [...CONFIG_PERU.tasas.TRAMOS_IMPUESTO].reverse() },
  }
  check('tramos cargados al revés dan el mismo impuesto',
        peruCon(alReves, 5000).impuesto === r.impuesto)

  // Progresividad: la tasa efectiva sube con la renta y nunca llega a la marginal.
  const efectiva = (base) =>
    peru('base_a_liquido', base).impuesto * 12 / (peru('base_a_liquido', base).totalHaberesImponibles * 14)
  check('la tasa efectiva es creciente',
        efectiva(3500) < efectiva(8000) && efectiva(8000) < efectiva(40000))
  check('la tasa efectiva se queda bajo la marginal máxima (30%)', efectiva(40000) < 0.30)
}

// El refrigerio es remuneración computable: no puede quedar sólo en el imponible.
console.log()
console.log('[Perú — refrigerio computable]')
{
  const sinRefrigerio = {
    ...CONFIG_PERU,
    tasas: { ...CONFIG_PERU.tasas, REFRIGERIO: 0 },
  }
  const con = peru('base_a_liquido', 5000)
  const sin = peruCon(sinRefrigerio, 5000)
  const R = CONFIG_PERU.tasas.REFRIGERIO

  check('entra al imponible', con.totalHaberesImponibles === sin.totalHaberesImponibles + R)
  check('entra a las gratificaciones', con.gratificacionesAnual === sin.gratificacionesAnual + R * 2)
  check('entra a la CTS', con.ctsAnual === Math.round(sin.ctsAnual + R + R * 2 / 12))
  check('entra al impuesto de 5ta', con.impuesto > sin.impuesto)
  check('entra a los aportes patronales', con.totalPatronal > sin.totalPatronal)
}

console.log('\nTodo OK\n')
