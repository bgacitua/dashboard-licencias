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
  _pais,
  config
) {
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
  }
}
