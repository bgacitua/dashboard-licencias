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
  //   BBE: bonificación extraordinaria 9% sobre las 2 gratificaciones (afecta 5ta cat.)
  //   bonoEmpresa: anual (utilidades / bono gestión)
  const sueldosAnuales = tasas.SUELDOS_ANUALES ?? 14
  const UIT = tasas.UIT ?? 0
  // Deducción automática = 7 UIT (DEDUCCION_FIJA_UIT).
  // Las 3 UIT adicionales (DEDUCCION_ADICIONAL_UIT) requieren gastos deducibles
  // sustentados con comprobantes — no se aplican por defecto.
  const deduccion = (tasas.DEDUCCION_FIJA_UIT ?? 0) * UIT
  const bonifExtraordinaria = sueldoBase * 2 * 0.09
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

  // Costos patronales
  const essaludEmpleador = imponible * (tasas.TASA_SALUD_PATRONAL ?? 0.09)
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
    essaludEmpleador,
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
  const { tasas } = config

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

  // Costo mensual recurrente (lo que la empresa paga cada mes): bruto + EsSalud.
  // Las gratificaciones (2 sueldos) son eventos anuales, no se prorratean.
  const totalPatronal = d.essaludEmpleador
  const costoTotalEmpresa = d.totalHaberes + totalPatronal

  // Bono empresa anual + gratificaciones (2 sueldos base)
  const bonoEmpresaAnual = {
    montoImponible: d.bonoEmpresa,
    descuentoTrabajador: 0,
    costoEmpresa: d.bonoEmpresa,
  }
  // EsSalud también aplica sobre las gratificaciones
  const essaludSobreGratificaciones = d.gratificacionesAnual * (tasas.TASA_SALUD_PATRONAL ?? 0.09)
  const gratificacionesCostoAnual = d.gratificacionesAnual + essaludSobreGratificaciones

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
    essaludEmpleador:       Math.round(d.essaludEmpleador),
    gratificacionesAnual:   Math.round(d.gratificacionesAnual),
    gratificacionesCostoAnual: Math.round(gratificacionesCostoAnual),
    essaludGratificaciones: Math.round(essaludSobreGratificaciones),
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
  config
) {
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
    gratificacionesAnual:   0,
    gratificacionesCostoAnual: 0,
    essaludGratificaciones: 0,
  }
}
