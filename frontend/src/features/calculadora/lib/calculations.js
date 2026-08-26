// features/calculadora/lib/calculations.js

function calcularImpuesto(baseTributable, tramos) {
  if (baseTributable <= 0 || tramos.length === 0) return 0
  const tramo = tramos.find(t => baseTributable >= t.desde && baseTributable <= t.hasta)
  if (!tramo || tramo.tasa === 0) return 0
  return Math.max(0, baseTributable * tramo.tasa - tramo.rebaja)
}

function calcularBonoAnualDesdeClp(montoClp, tasaAFP, tasas) {
  const montoImponible = Math.round(montoClp)
  const descuentoTrabajador = Math.round(
    montoImponible * (tasaAFP + tasas.TASA_SALUD_FONASA + tasas.TASA_CESANTIA)
  )
  const costoPatronal = Math.round(
    montoImponible * (tasas.CESANTIA_EMPLEADOR + tasas.MUTUAL + tasas.SIS + tasas.EXPECTATIVA_VIDA)
  )
  return {
    montoImponible,
    descuentoTrabajador,
    costoEmpresa: montoImponible + costoPatronal,
  }
}

function calcularBonoAnual(ufAmount, ufValue, tasaAFP, tasas) {
  return calcularBonoAnualDesdeClp(Math.round(ufAmount * ufValue), tasaAFP, tasas)
}

function simular(
  sueldoBase,
  afpNombre,
  sistemaSalud,
  saludUF,
  movilizacion,
  bonosImponibles,
  bonosNoImponibles,
  bonoEmpresaMonto,
  bonoEmpresaTasa,
  config
) {
  const { afpData, ufValue, tasas, taxBrackets } = config
  const tasaAFP = afpData[afpNombre] || 0.1049

  // Topes diferenciados (AFP/Salud vs Cesantía)
  const topeAFPSalud = tasas.TOPE_AFP_SALUD_UF * ufValue
  const topeCesantia = tasas.TOPE_CESANTIA_UF * ufValue

  const gratificacion = Math.min(
    sueldoBase * 0.25,
    (tasas.GRATIFICACION_MAX_IMM * tasas.SUELDO_MINIMO) / 12
  )

  const imponible = sueldoBase + gratificacion + bonosImponibles
  const impAfectoAFPSalud = Math.min(imponible, topeAFPSalud)
  const impAfectoCesantia = Math.min(imponible, topeCesantia)

  const descuentoAFP = impAfectoAFPSalud * tasaAFP
  const descuentoSalud = sistemaSalud === "fonasa"
    ? impAfectoAFPSalud * tasas.TASA_SALUD_FONASA
    : Math.max(impAfectoAFPSalud * tasas.TASA_SALUD_FONASA, saludUF * ufValue)
  const descuentoCesantia = impAfectoCesantia * tasas.TASA_CESANTIA

  const baseTributable = imponible - descuentoAFP - descuentoSalud - descuentoCesantia
  const impuesto = calcularImpuesto(baseTributable, taxBrackets)

  const totalDescuentos = descuentoAFP + descuentoSalud + descuentoCesantia + impuesto
  const bonoEmpresa = bonoEmpresaTasa > 0
    ? Math.round(sueldoBase * bonoEmpresaTasa)
    : bonoEmpresaMonto
  const totalHaberes = imponible + movilizacion + bonosNoImponibles
  const liquido = totalHaberes - totalDescuentos

  return {
    gratificacion, imponible, impAfectoAFPSalud, impAfectoCesantia,
    descuentoAFP, descuentoSalud, descuentoCesantia,
    impuesto, totalDescuentos, bonoEmpresa, totalHaberes, liquido,
  }
}

// ============================================================================
// PERU
// ============================================================================

/**
 * Impuesto de 5ta categoría (anual).
 * Tramos en config.tasas.TRAMOS_IMPUESTO con desde_uf/hasta_uf como múltiplos de UIT.
 */
function calcularImpuesto5taAnual(rentaAnualImponible, tasas) {
  if (rentaAnualImponible <= 0) return 0
  const UIT = tasas.UIT || 0
  const tramos = tasas.TRAMOS_IMPUESTO || []
  if (UIT === 0 || tramos.length === 0) return 0

  let impuesto = 0
  for (const t of tramos) {
    const desde = (t.desde_uf ?? 0) * UIT
    const hasta = t.hasta_uf == null ? Infinity : t.hasta_uf * UIT
    if (rentaAnualImponible <= desde) break
    const tramoBase = Math.min(rentaAnualImponible, hasta) - desde
    if (tramoBase > 0) impuesto += tramoBase * (t.tasa || 0)
  }
  return impuesto
}

/**
 * Aportes patronales de Perú (catálogo `tasas.APORTES_PATRONALES`).
 *
 * Son costo de empresa: no entran a descuentos del trabajador ni tocan el
 * líquido. Un aporte mal configurado se omite y se reporta; nunca se inventa
 * una tasa en el frontend.
 *
 * Sin catálogo cargado se conserva de forma transitoria la regla histórica de
 * EsSalud 9%, con advertencia.
 */
const TIPOS_APORTE_PATRONAL = ['porcentaje', 'porcentaje_con_tope', 'monto_fijo']

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v)

export function calcularAportesPatronalesPeru(imponible, tasas = {}) {
  const catalogo = tasas.APORTES_PATRONALES

  if (!Array.isArray(catalogo) || catalogo.length === 0) {
    const tasa = tasas.TASA_SALUD_PATRONAL ?? 0.09
    return {
      aportes: [{ id: 'essalud', nombre: 'EsSalud', tipo: 'porcentaje', tasa, monto: imponible * tasa }],
      total: imponible * tasa,
      errores: [
        'Faltan los aportes patronales detallados (APORTES_PATRONALES): se aplica EsSalud 9% de forma transitoria',
      ],
    }
  }

  const errores = []
  const ids = new Set()
  const aportes = []

  catalogo.forEach((a, i) => {
    const et = a && typeof a.id === 'string' && a.id ? `Aporte '${a.id}'` : `APORTES_PATRONALES[${i}]`

    if (!a || typeof a.id !== 'string' || !a.id) {
      errores.push(`${et}: 'id' es obligatorio`)
      return
    }
    if (ids.has(a.id)) {
      errores.push(`${et}: identificador repetido`)
      return
    }
    ids.add(a.id)

    if (!TIPOS_APORTE_PATRONAL.includes(a.tipo)) {
      errores.push(`${et}: tipo desconocido '${a.tipo}'`)
      return
    }
    if (a.tipo === 'monto_fijo') {
      if (!esNumero(a.monto) || a.monto < 0) {
        errores.push(`${et}: 'monto' debe ser numérico y no negativo`)
        return
      }
    } else {
      if (!esNumero(a.tasa) || a.tasa < 0) {
        errores.push(`${et}: 'tasa' debe ser numérica y no negativa`)
        return
      }
      if (a.base != null && a.base !== 'imponible') {
        errores.push(`${et}: base '${a.base}' no soportada`)
        return
      }
      if (a.tipo === 'porcentaje_con_tope' && (!esNumero(a.tope) || a.tope <= 0)) {
        errores.push(`${et}: 'tope' es obligatorio y debe ser mayor que cero`)
        return
      }
    }

    if (a.activo === false) return

    const monto =
      a.tipo === 'monto_fijo' ? a.monto
      : a.tipo === 'porcentaje_con_tope' ? Math.min(imponible, a.tope) * a.tasa
      : imponible * a.tasa

    aportes.push({ id: a.id, nombre: a.nombre || a.id, tipo: a.tipo, tasa: a.tasa, tope: a.tope, monto })
  })

  return { aportes, total: aportes.reduce((s, a) => s + a.monto, 0), errores }
}

/**
 * Bonificación extraordinaria (Ley 29351): sobre las gratificaciones no se
 * aporta a salud; la empresa paga ese equivalente al trabajador. Es 9% con
 * EsSalud puro y sólo 6,75% cuando el trabajador está afiliado a una EPS,
 * porque el 2,25% restante ya se destina a la EPS.
 */
function tasaBonificacionExtraordinaria(aportes, tasas) {
  const eps = aportes.find((a) => a.id === 'eps')
  if (!eps) return tasas.TASA_SALUD_PATRONAL ?? 0.09
  return aportes.find((a) => a.id === 'essalud')?.tasa ?? 0.0675
}

function simularPeru(
  sueldoBase,
  afpNombre,
  movilizacion,
  bonosImponibles,
  bonosNoImponibles,
  bonoEmpresaMonto,
  bonoEmpresaTasa,
  config
) {
  const { afpData, tasas } = config
  const tasaComisionAFP = afpData[afpNombre] || 0.0155
  const tasaAFPObligatoria = tasas.TASA_AFP_OBLIGATORIA ?? 0.10
  const tasaSeguroInvalidez = tasas.TASA_SEGUROS_INVALIDEZ ?? 0.0137
  const refrigerio = tasas.REFRIGERIO ?? 0

  // Refrigerio es imponible en Peru → suma a la base AFP/SIS/impuesto
  const imponible = sueldoBase + refrigerio + bonosImponibles

  // Aportes patronales: se resuelven antes del impuesto porque la tasa de la
  // bonificación extraordinaria depende del esquema de salud configurado.
  const { aportes: aportesPatronales, errores: erroresAportes } =
    calcularAportesPatronalesPeru(imponible, tasas)
  const tasaBonifExtraordinaria = tasaBonificacionExtraordinaria(aportesPatronales, tasas)

  const afpObligatorio = imponible * tasaAFPObligatoria
  const comisionAFP = imponible * tasaComisionAFP
  const seguroInvalidez = imponible * tasaSeguroInvalidez

  // Bono Empresa en Peru = monto anual (utilidades, bono gestión, etc.).
  // Entra al cálculo de impuesto 5ta categoría como ingreso imponible anual.
  const bonoEmpresa = bonoEmpresaTasa > 0
    ? Math.round(sueldoBase * bonoEmpresaTasa)
    : bonoEmpresaMonto

  // Impuesto 5ta categoría — renta anual proyectada:
  //   sueldoBase × SUELDOS_ANUALES (14 = 12 sueldos + 2 gratificaciones)
  //   refrigerio y bonos imponibles se pagan 12 veces (no entran a gratificación)
  //   BBE: bonificación extraordinaria sobre las 2 gratificaciones (afecta 5ta cat.)
  //   bonoEmpresa: anual (utilidades / bono gestión)
  const sueldosAnuales = tasas.SUELDOS_ANUALES ?? 14
  const UIT = tasas.UIT ?? 0
  // Deducción automática = 7 UIT (DEDUCCION_FIJA_UIT).
  // Las 3 UIT adicionales (DEDUCCION_ADICIONAL_UIT) requieren gastos deducibles
  // sustentados con comprobantes — no se aplican por defecto.
  const deduccion = (tasas.DEDUCCION_FIJA_UIT ?? 0) * UIT
  const bonifExtraordinaria = sueldoBase * 2 * tasaBonifExtraordinaria
  const rentaAnualBruta =
    sueldoBase * sueldosAnuales +
    (refrigerio + bonosImponibles) * 12 +
    bonifExtraordinaria +
    bonoEmpresa
  const rentaAnualImponible = Math.max(0, rentaAnualBruta - deduccion)
  const impuestoAnual = calcularImpuesto5taAnual(rentaAnualImponible, tasas)
  const impuestoMensual = impuestoAnual / 12

  const totalDescuentos = afpObligatorio + comisionAFP + seguroInvalidez + impuestoMensual

  const totalHaberes = imponible + movilizacion + bonosNoImponibles
  const liquido = totalHaberes - totalDescuentos

  // Gratificaciones Peru: 2 sueldos extra (julio + diciembre).
  // No prorrateadas mensualmente — se pagan como evento anual.
  const gratificacionesAnual = sueldoBase * 2

  return {
    imponible,
    refrigerio,
    afpObligatorio,
    comisionAFP,
    seguroInvalidez,
    impuestoAnual,
    impuestoMensual,
    totalDescuentos,
    bonoEmpresa,
    totalHaberes,
    liquido,
    aportesPatronales,
    erroresAportes,
    tasaBonifExtraordinaria,
    gratificacionesAnual,
  }
}

function calcularPeru(
  modo,
  montoIngresado,
  afpNombre,
  movilizacion,
  bonoEmpresaMonto,
  bonoEmpresaTasa,
  bonos,
  config
) {
  const bonosImponibles = bonos.filter(b => b.imponible).reduce((s, b) => s + b.monto, 0)
  const bonosNoImponibles = bonos.filter(b => !b.imponible).reduce((s, b) => s + b.monto, 0)

  const sim = (base) =>
    simularPeru(base, afpNombre, movilizacion, bonosImponibles, bonosNoImponibles,
                bonoEmpresaMonto, bonoEmpresaTasa, config)

  let sueldoBase
  if (modo === 'base_a_liquido') {
    sueldoBase = montoIngresado
  } else {
    const liquidoObjetivo = montoIngresado
    sueldoBase = Math.round(liquidoObjetivo * 1.25)
    for (let i = 0; i < 50; i++) {
      const diff = liquidoObjetivo - sim(sueldoBase).liquido
      if (Math.abs(diff) < 1) break
      sueldoBase = Math.round(sueldoBase + diff * 0.8)
    }
  }

  const d = sim(sueldoBase)

  // Costo mensual recurrente: bruto + aportes patronales del catálogo.
  // Las gratificaciones (2 sueldos) son eventos anuales, no se prorratean.
  // Se redondea aporte por aporte para que el subtotal sea exactamente la suma
  // de las filas que muestra la vista.
  const aportesPatronales = d.aportesPatronales.map((a) => ({ ...a, monto: Math.round(a.monto) }))
  const totalPatronal = aportesPatronales.reduce((s, a) => s + a.monto, 0)
  const costoTotalEmpresa = d.totalHaberes + totalPatronal

  // Bono empresa anual + gratificaciones (2 sueldos base)
  const bonoEmpresaAnual = {
    montoImponible: d.bonoEmpresa,
    descuentoTrabajador: 0,
    costoEmpresa: d.bonoEmpresa,
  }
  // Sobre las gratificaciones no se aporta a salud: la empresa paga en su lugar
  // la bonificación extraordinaria al trabajador.
  const bonificacionExtraordinaria = d.gratificacionesAnual * d.tasaBonifExtraordinaria
  const gratificacionesCostoAnual = d.gratificacionesAnual + bonificacionExtraordinaria

  const costoTotalEmpresaAnual =
    Math.round(costoTotalEmpresa) * 12 +
    gratificacionesCostoAnual +
    bonoEmpresaAnual.costoEmpresa

  const zeroBono = { montoImponible: 0, descuentoTrabajador: 0, costoEmpresa: 0 }

  return {
    sueldoBase:             Math.round(sueldoBase),
    sueldoLiquido:          modo === "base_a_liquido" ? Math.round(d.liquido) : montoIngresado,
    gratificacion:          0,
    bonosImponibles,
    bonosNoImponibles,
    totalHaberesImponibles: Math.round(d.imponible),
    movilizacion,
    bonoEmpresaAnual,
    totalHaberes:           Math.round(d.totalHaberes),
    cotizacionPrevisional:  Math.round(d.afpObligatorio + d.comisionAFP),
    cotizacionSalud:        0,
    cesantia:               0,
    impuesto:               Math.round(d.impuestoMensual),
    totalDescuentos:        Math.round(d.totalDescuentos),
    // Patronales — Chile-only en 0
    cesantiaEmpleador:      0,
    mutual:                 0,
    sis:                    0,
    expectativaVida:        0,
    afpEmpleador:           0,
    seguroComplementario:   0,
    totalPatronal:          Math.round(totalPatronal),
    costoTotalEmpresa:      Math.round(costoTotalEmpresa),
    bonoNavidad:            zeroBono,
    bonoFiestasPatrias:     zeroBono,
    bonoEscolaridad:        zeroBono,
    costoTotalEmpresaAnual,
    // Peru-specific
    refrigerio:             Math.round(d.refrigerio),
    afpObligatorio:         Math.round(d.afpObligatorio),
    comisionAFP:            Math.round(d.comisionAFP),
    seguroInvalidez:        Math.round(d.seguroInvalidez),
    essaludEmpleador:       aportesPatronales
                              .filter((a) => a.id === 'essalud' || a.id === 'eps')
                              .reduce((s, a) => s + a.monto, 0),
    aportesPatronales,
    erroresAportes:         d.erroresAportes,
    gratificacionesAnual:   Math.round(d.gratificacionesAnual),
    gratificacionesCostoAnual: Math.round(gratificacionesCostoAnual),
    tasaBonifExtraordinaria: d.tasaBonifExtraordinaria,
    bonificacionExtraordinaria: Math.round(bonificacionExtraordinaria),
  }
}

// ============================================================================
// BRASIL — CLT régimen general, remuneración fija mensual
// ============================================================================
//
// Fuentes normativas (vigencia 18-08-2026, sin consultas en tiempo de ejecución):
//   INSS 2026 ....... https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal
//   IRPF/IRRF ....... https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2025
//   Reducción IRRF .. https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm
//   Costo empresa ... docs/superpowers/specs/2026-08-18-brasil-calculadora-mvp-design.md
//
// Todos los factores vienen de calculadora.country_config.tasas (pais='brasil').
// No hay fallback local: si falta una clave se devuelve configError.

export const FACTORES_BRASIL = [
  // Costo empresa (modelo del Excel)
  'INSS_PATRONAL',
  'RAT',
  'TERCEIROS',
  'FGTS',
  'MESES_ANIO',
  // Liquidación del trabajador
  'SALARIO_MINIMO',
  'INSS_TRABAJADOR_TRAMOS',
  'INSS_TRABAJADOR_TOPE',
  'IRRF_DESCUENTO_SIMPLIFICADO',
  'IRRF_TRAMOS',
  'IRRF_REDUCCION_LIMITE_TOTAL',
  'IRRF_REDUCCION_LIMITE_PARCIAL',
  'IRRF_REDUCCION_MAXIMA',
  'IRRF_REDUCCION_CONSTANTE',
  'IRRF_REDUCCION_FACTOR',
]

/**
 * Factores con default estructural. No son obligatorios porque su valor neutro
 * reproduce exactamente el modelo del Excel: FAP = 1 significa "sin FAP", y las
 * provisiones se derivan de MESES_ANIO y del tercio constitucional. Así una
 * configuración anterior sigue calculando bien en vez de bloquearse, y quien
 * necesite un FAP distinto sólo lo agrega en la BD.
 */
export function conDefaultsBrasil(tasas) {
  const t = tasas || {}
  const meses = t.MESES_ANIO
  return {
    ...t,
    RAT_FAP: t.RAT_FAP ?? 1,
    PROVISION_13_DIVISOR: t.PROVISION_13_DIVISOR ?? meses,
    PROVISION_VACACIONES_DIVISOR: t.PROVISION_VACACIONES_DIVISOR ?? meses,
    ADICIONAL_VACACIONES_DIVISOR: t.ADICIONAL_VACACIONES_DIVISOR ?? 3,
  }
}

/** Devuelve las claves de tasas que faltan para Brasil (array vacío si está completa). */
export function factoresBrasilFaltantes(tasas) {
  const t = tasas || {}
  return FACTORES_BRASIL.filter((k) => {
    const v = t[k]
    if (v === undefined || v === null) return true
    if (k.endsWith('TRAMOS')) return !Array.isArray(v) || v.length === 0
    return false
  })
}

/**
 * INSS del trabajador: progresivo y marginal por tramo, topado en
 * INSS_TRABAJADOR_TOPE. Nunca aplica una tasa única al sueldo completo.
 */
export function calcularINSSBrasil(sueldoBase, tasas) {
  if (sueldoBase <= 0) return 0
  const base = Math.min(sueldoBase, tasas.INSS_TRABAJADOR_TOPE)
  let inss = 0
  for (const t of tasas.INSS_TRABAJADOR_TRAMOS) {
    if (base <= t.desde) break
    inss += (Math.min(base, t.hasta) - t.desde) * t.tasa
  }
  return inss
}

function irrfDesdeBase(baseIRRF, tasas) {
  if (baseIRRF <= 0) return 0
  const tramo = tasas.IRRF_TRAMOS.find(
    (t) => baseIRRF >= t.desde && (t.hasta == null || baseIRRF <= t.hasta)
  )
  if (!tramo) return 0
  return Math.max(0, baseIRRF * tramo.tasa - tramo.rebaja)
}

/**
 * Reducción IRRF vigente 2026 (Ley 15.270/2025). Se calcula sobre el sueldo
 * bruto, NO sobre la base de IRRF, y nunca supera el IRRF bruto.
 */
function reduccionIRRFBrasil(sueldoBase, irrfBruto, tasas) {
  if (sueldoBase <= tasas.IRRF_REDUCCION_LIMITE_TOTAL) {
    return Math.min(tasas.IRRF_REDUCCION_MAXIMA, irrfBruto)
  }
  if (sueldoBase <= tasas.IRRF_REDUCCION_LIMITE_PARCIAL) {
    const parcial = tasas.IRRF_REDUCCION_CONSTANTE - tasas.IRRF_REDUCCION_FACTOR * sueldoBase
    return Math.max(0, Math.min(irrfBruto, parcial))
  }
  return 0
}

/**
 * IRRF del trabajador. Compara las dos bases posibles y aplica automáticamente
 * la que deja menor impuesto:
 *   - base legal: sueldo bruto − INSS del trabajador
 *   - base simplificada: sueldo bruto − descuento simplificado mensual
 *
 * Esta es una estimación de compensaciones, no una liquidación personal: no
 * considera dependientes ni ninguna otra deducción individual.
 */
export function calcularIRRFBrasil(sueldoBase, inssTrabajador, tasas) {
  const baseLegal = Math.max(0, sueldoBase - inssTrabajador)
  const baseSimplificada = Math.max(0, sueldoBase - tasas.IRRF_DESCUENTO_SIMPLIFICADO)

  const evaluar = (baseIRRF, metodo) => {
    const irrfBruto = irrfDesdeBase(baseIRRF, tasas)
    const reduccion = reduccionIRRFBrasil(sueldoBase, irrfBruto, tasas)
    return {
      metodo,
      baseIRRF,
      irrfBruto,
      reduccion,
      irrfFinal: Math.max(0, irrfBruto - reduccion),
    }
  }

  const legal = evaluar(baseLegal, 'legal')
  const simplificado = evaluar(baseSimplificada, 'simplificado')

  // Empate → deducciones legales (método por defecto de la legislación).
  const elegido = simplificado.irrfFinal < legal.irrfFinal ? simplificado : legal
  return { ...elegido, baseLegal, baseSimplificada }
}

/** Suma de las cargas patronales directas, como fracción del sueldo base. */
export function tasaCargasPatronalesBrasil(tasas) {
  const t = conDefaultsBrasil(tasas)
  return t.INSS_PATRONAL + t.RAT * t.RAT_FAP + t.TERCEIROS + t.FGTS
}

/** Costo empresa del Excel. Sin cargas adicionales sobre las provisiones. */
export function calcularCostoEmpresaBrasil(sueldoBase, tasasRaw) {
  const tasas = conDefaultsBrasil(tasasRaw)
  const inssPatronal = sueldoBase * tasas.INSS_PATRONAL
  // El FAP multiplica al RAT (0,5 a 2,0 según siniestralidad); FAP = 1 deja
  // el RAT tal cual, que es el caso del modelo entregado.
  const rat = sueldoBase * tasas.RAT * tasas.RAT_FAP
  const terceros = sueldoBase * tasas.TERCEIROS
  const fgts = sueldoBase * tasas.FGTS
  const totalEncargos = inssPatronal + rat + terceros + fgts

  const provision13 = sueldoBase / tasas.PROVISION_13_DIVISOR
  const provisionVacaciones = sueldoBase / tasas.PROVISION_VACACIONES_DIVISOR
  const adicionalTercioVacaciones = provisionVacaciones / tasas.ADICIONAL_VACACIONES_DIVISOR
  const totalProvisiones = provision13 + provisionVacaciones + adicionalTercioVacaciones

  const costoEmpresaMensual = sueldoBase + totalEncargos + totalProvisiones

  return {
    inssPatronal,
    rat,
    terceros,
    fgts,
    totalEncargos,
    provision13,
    provisionVacaciones,
    adicionalTercioVacaciones,
    totalProvisiones,
    costoEmpresaMensual,
    costoEmpresaAnual: costoEmpresaMensual * tasas.MESES_ANIO,
  }
}

/**
 * Bono empresa anual. No entra al líquido mensual ni al costo mensual, y no
 * genera provisiones de 13º ni de vacaciones: sólo suma al costo anual, con
 * sus cargas patronales directas si es imponible.
 */
export function calcularBonoEmpresaBrasil(montoBono, imponible, tasas) {
  const monto = Math.max(0, montoBono || 0)
  const cargas = imponible ? monto * tasaCargasPatronalesBrasil(tasas) : 0
  return { monto, cargas, costoEmpresa: monto + cargas, imponible: Boolean(imponible) }
}

/** Líquido resultante de un sueldo base dado. Estrictamente creciente en la base. */
function liquidoDesdeBaseBrasil(sueldoBase, tasas) {
  const inss = calcularINSSBrasil(sueldoBase, tasas)
  const irrf = calcularIRRFBrasil(sueldoBase, inss, tasas)
  return sueldoBase - inss - irrf.irrfFinal
}

/**
 * Líquido → base por bisección. La bisección converge también en los quiebres
 * de tramo INSS, IRRF y reducción IRRF, donde una fórmula inversa lineal
 * fallaría. Converge a menos de R$ 0,01 del objetivo.
 *
 * ponytail: en R$ 7.350 la fórmula legal de la reducción deja un salto de
 * ~R$ 0,0034 en el líquido (la reducción parcial no llega exactamente a cero
 * antes de cortarse), así que ahí la bisección devuelve el borde del salto con
 * un error de ~R$ 0,008 en la base. Está dentro de la tolerancia exigida; sólo
 * habría que tocarlo si el requisito bajara del centavo.
 */
export function resolverBaseParaLiquidoBrasil(liquidoObjetivo, tasas) {
  if (liquidoObjetivo <= 0) return 0

  let lo = liquidoObjetivo // el líquido nunca supera a la base
  let hi = liquidoObjetivo * 1.6 + 1000
  for (let i = 0; i < 60 && liquidoDesdeBaseBrasil(hi, tasas) < liquidoObjetivo; i++) {
    hi *= 2
  }

  for (let i = 0; i < 200 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2
    if (liquidoDesdeBaseBrasil(mid, tasas) < liquidoObjetivo) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

const CERO_BONO = { montoImponible: 0, descuentoTrabajador: 0, costoEmpresa: 0 }

const RESULTADO_BRASIL_VACIO = {
  sueldoBase: 0, sueldoLiquido: 0, gratificacion: 0,
  bonosImponibles: 0, bonosNoImponibles: 0, totalHaberesImponibles: 0,
  movilizacion: 0, bonoEmpresaAnual: CERO_BONO, totalHaberes: 0,
  cotizacionPrevisional: 0, cotizacionSalud: 0, cesantia: 0, impuesto: 0,
  totalDescuentos: 0,
  cesantiaEmpleador: 0, mutual: 0, sis: 0, expectativaVida: 0,
  afpEmpleador: 0, seguroComplementario: 0, totalPatronal: 0,
  costoTotalEmpresa: 0,
  bonoNavidad: CERO_BONO, bonoFiestasPatrias: CERO_BONO, bonoEscolaridad: CERO_BONO,
  costoTotalEmpresaAnual: 0,
  // Perú en 0
  refrigerio: 0, afpObligatorio: 0, comisionAFP: 0, seguroInvalidez: 0,
  essaludEmpleador: 0, gratificacionesAnual: 0, gratificacionesCostoAnual: 0,
  aportesPatronales: [], erroresAportes: [],
  tasaBonifExtraordinaria: 0, bonificacionExtraordinaria: 0,
  // Brasil — trabajador
  inssTrabajador: 0, baseIRRF: 0, metodoIRRF: null, irrfBruto: 0,
  reduccionIRRF: 0, irrfFinal: 0,
  // Brasil — empresa
  inssPatronal: 0, rat: 0, terceros: 0, fgts: 0, totalEncargos: 0,
  provision13: 0, provisionVacaciones: 0, adicionalTercioVacaciones: 0,
  totalProvisiones: 0,
  bonoEmpresaBrasil: { monto: 0, cargas: 0, costoEmpresa: 0, imponible: false },
  costoEmpresaAnualSinBono: 0,
  configError: null,
}

function errorBrasil(mensaje) {
  return { ...RESULTADO_BRASIL_VACIO, configError: mensaje }
}

/**
 * Calculadora Brasil. No redondea ningún paso intermedio: el redondeo ocurre
 * sólo al formatear en la vista.
 */
function calcularBrasil(modo, montoIngresado, bonoEmpresaMonto, bonoEmpresaTasa, bonoImponible, config) {
  const tasas = config?.tasas || {}

  const faltantes = factoresBrasilFaltantes(tasas)
  if (faltantes.length > 0) {
    return errorBrasil(`Configuración de Brasil incompleta: faltan ${faltantes.join(', ')}`)
  }
  if (montoIngresado < 0) {
    return errorBrasil('El monto ingresado no puede ser negativo.')
  }
  if (montoIngresado === 0) return { ...RESULTADO_BRASIL_VACIO }

  const sueldoBase =
    modo === 'base_a_liquido'
      ? montoIngresado
      : resolverBaseParaLiquidoBrasil(montoIngresado, tasas)

  if (sueldoBase < tasas.SALARIO_MINIMO) {
    return errorBrasil(
      'El sueldo líquido deseado implica un sueldo base inferior al salario mínimo de Brasil. ' +
        'Este modelo cubre una contratación CLT estándar de jornada completa.'
    )
  }

  const inssTrabajador = calcularINSSBrasil(sueldoBase, tasas)
  const irrf = calcularIRRFBrasil(sueldoBase, inssTrabajador, tasas)
  const totalDescuentos = inssTrabajador + irrf.irrfFinal
  const sueldoLiquido = sueldoBase - totalDescuentos
  const empresa = calcularCostoEmpresaBrasil(sueldoBase, tasas)

  // El bono empresa es anual: no toca el líquido ni el costo mensual.
  const montoBono = bonoEmpresaTasa > 0 ? sueldoBase * bonoEmpresaTasa : bonoEmpresaMonto
  const bono = calcularBonoEmpresaBrasil(montoBono, bonoImponible, tasas)

  return {
    ...RESULTADO_BRASIL_VACIO,
    sueldoBase,
    sueldoLiquido,
    totalHaberesImponibles: sueldoBase,
    totalHaberes: sueldoBase,
    totalDescuentos,
    totalPatronal: empresa.totalEncargos,
    costoTotalEmpresa: empresa.costoEmpresaMensual,
    costoTotalEmpresaAnual: empresa.costoEmpresaAnual + bono.costoEmpresa,
    costoEmpresaAnualSinBono: empresa.costoEmpresaAnual,
    bonoEmpresaBrasil: bono,
    bonoEmpresaAnual: {
      montoImponible: bono.monto,
      descuentoTrabajador: 0,
      costoEmpresa: bono.costoEmpresa,
    },
    // Brasil — trabajador
    inssTrabajador,
    baseIRRF: irrf.baseIRRF,
    metodoIRRF: irrf.metodo,
    irrfBruto: irrf.irrfBruto,
    reduccionIRRF: irrf.reduccion,
    irrfFinal: irrf.irrfFinal,
    // Brasil — empresa
    inssPatronal: empresa.inssPatronal,
    rat: empresa.rat,
    terceros: empresa.terceros,
    fgts: empresa.fgts,
    totalEncargos: empresa.totalEncargos,
    provision13: empresa.provision13,
    provisionVacaciones: empresa.provisionVacaciones,
    adicionalTercioVacaciones: empresa.adicionalTercioVacaciones,
    totalProvisiones: empresa.totalProvisiones,
  }
}

// ============================================================================
// Entrypoint
// ============================================================================

export function calcularRemuneracion(
  modo,
  montoIngresado,
  afpNombre,
  sistemaSalud,
  saludUF,
  movilizacion,
  bonoEmpresaMonto,
  bonoEmpresaTasa,
  bonos,
  pais,
  config,
  bonoEmpresaImponible = false
) {
  if (pais === 'brasil') {
    return calcularBrasil(
      modo, montoIngresado, bonoEmpresaMonto, bonoEmpresaTasa, bonoEmpresaImponible, config
    )
  }

  if (pais === 'peru') {
    return calcularPeru(modo, montoIngresado, afpNombre, movilizacion,
                        bonoEmpresaMonto, bonoEmpresaTasa, bonos, config)
  }

  // Chile (y default)
  const { ufValue, tasas } = config
  const tasaAFP = config.afpData[afpNombre] || 0.1049

  const bonosImponibles = bonos.filter(b => b.imponible).reduce((s, b) => s + b.monto, 0)
  const bonosNoImponibles = bonos.filter(b => !b.imponible).reduce((s, b) => s + b.monto, 0)

  const sim = (base) =>
    simular(base, afpNombre, sistemaSalud, saludUF, movilizacion, bonosImponibles, bonosNoImponibles, bonoEmpresaMonto, bonoEmpresaTasa, config)

  let sueldoBase

  if (modo === 'base_a_liquido') {
    sueldoBase = montoIngresado
  } else {
    // Iteración convergente: Líquido → Base
    const liquidoObjetivo = montoIngresado
    sueldoBase = Math.round(liquidoObjetivo * 1.35)

    for (let i = 0; i < 50; i++) {
      const diferencia = liquidoObjetivo - sim(sueldoBase).liquido
      if (Math.abs(diferencia) < 100) break
      sueldoBase = Math.round(sueldoBase + diferencia * 0.8)
    }
  }

  const d = sim(sueldoBase)

  // Costos patronales con topes diferenciados
  const cesantiaEmpleador    = Math.round(d.impAfectoCesantia * tasas.CESANTIA_EMPLEADOR)
  const mutual               = Math.round(d.impAfectoAFPSalud * tasas.MUTUAL)
  const sis                  = Math.round(d.impAfectoAFPSalud * tasas.SIS)
  const expectativaVida      = Math.round(d.impAfectoAFPSalud * tasas.EXPECTATIVA_VIDA)
  const afpEmpleador         = Math.round(d.impAfectoAFPSalud * tasas.AFP_EMPLEADOR)
  const seguroComplementario = Math.round(tasas.SEGURO_COMPLEMENTARIO_UF * ufValue)
  const totalPatronal = cesantiaEmpleador + mutual + sis + expectativaVida + afpEmpleador + seguroComplementario

  const costoTotalEmpresa = d.totalHaberes + totalPatronal

  const bonoNavidad        = calcularBonoAnual(config.bonosAnualesUF.navidad,       ufValue, tasaAFP, tasas)
  const bonoFiestasPatrias = calcularBonoAnual(config.bonosAnualesUF.fiestaPatrias, ufValue, tasaAFP, tasas)
  const bonoEscolaridad    = calcularBonoAnual(config.bonosAnualesUF.escolaridad,   ufValue, tasaAFP, tasas)
  const bonoEmpresaAnual   = calcularBonoAnualDesdeClp(d.bonoEmpresa, tasaAFP, tasas)

  const costoTotalEmpresaAnual =
    Math.round(costoTotalEmpresa) * 12 +
    bonoNavidad.costoEmpresa +
    bonoFiestasPatrias.costoEmpresa +
    bonoEscolaridad.costoEmpresa +
    bonoEmpresaAnual.costoEmpresa

  return {
    sueldoBase:             Math.round(sueldoBase),
    sueldoLiquido:          modo === "base_a_liquido" ? Math.round(d.liquido) : montoIngresado,
    gratificacion:          Math.round(d.gratificacion),
    bonosImponibles,
    bonosNoImponibles,
    totalHaberesImponibles: Math.round(d.imponible),
    movilizacion,
    bonoEmpresaAnual,
    totalHaberes:           Math.round(d.totalHaberes),
    cotizacionPrevisional:  Math.round(d.descuentoAFP),
    cotizacionSalud:        Math.round(d.descuentoSalud),
    cesantia:               Math.round(d.descuentoCesantia),
    impuesto:               Math.round(d.impuesto),
    totalDescuentos:        Math.round(d.totalDescuentos),
    cesantiaEmpleador,
    mutual,
    sis,
    expectativaVida,
    afpEmpleador,
    seguroComplementario,
    totalPatronal,
    costoTotalEmpresa:      Math.round(costoTotalEmpresa),
    bonoNavidad,
    bonoFiestasPatrias,
    bonoEscolaridad,
    costoTotalEmpresaAnual,
    // Peru-specific (en 0 para Chile)
    refrigerio:             0,
    afpObligatorio:         0,
    comisionAFP:            0,
    seguroInvalidez:        0,
    essaludEmpleador:       0,
    aportesPatronales:      [],
    erroresAportes:         [],
    gratificacionesAnual:   0,
    gratificacionesCostoAnual: 0,
    tasaBonifExtraordinaria: 0,
    bonificacionExtraordinaria: 0,
  }
}

/**
 * Perú: suma al Costo Empresa Anual ya calculado los tres ítems que devuelve
 * el backend (reparto de utilidades, asignación familiar y canasta navideña).
 *
 * No toca ningún otro cálculo: sueldo, AFP, EsSalud, 5ta categoría y
 * gratificaciones quedan exactamente iguales. Si `extras` es null (país
 * distinto de Perú, config incompleta o request en vuelo) devuelve
 * `resultados` sin cambios.
 */
export function aplicarExtrasPeru(resultados, extras) {
  if (!extras) return resultados

  const repartoUtilidades = Math.round(extras.reparto_utilidades_estimado || 0)
  const asignacionFamiliarAnual = Math.round(extras.asignacion_familiar_anual || 0)
  const canastaNavidena = Math.round(extras.canasta_navidena_anual || 0)

  return {
    ...resultados,
    repartoUtilidades,
    asignacionFamiliarAnual,
    canastaNavidena,
    costoTotalEmpresaAnual:
      resultados.costoTotalEmpresaAnual +
      repartoUtilidades +
      asignacionFamiliarAnual +
      canastaNavidena,
  }
}
