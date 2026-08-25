/**
 * Dos bonos más sobre el dataset de Marcajes, cada uno con su propio periodo.
 *
 *  1. Colación y Movilización — periodo libre (quincena a quincena). Solo sábados
 *     y domingos, y se paga POR RECURRENCIA: cada día genera su asignación. Tres
 *     fines de semana trabajados son 3 movilizaciones + 3 colaciones, no una de
 *     cada una. Los turnos excluidos no generan ninguna.
 *
 *  2. Bono Contratista — mes calendario completo. Turnos de contratista, una
 *     asignación por SEMANA anclada al jueves, igual que el bono especial.
 *
 * Todo se calcula en el navegador sobre las filas que el tab ya tiene.
 */
import * as XLSX from 'xlsx'

import { desplazar, inicioSemana } from './bonoEspecial.js'
import { aIso } from './marcas.js'

// Fuera del bono de fin de semana: no generan movilización ni colación, aunque se
// trabaje sábado o domingo y aunque superen las horas.
export const TURNOS_EXCLUIDOS = ['06:00-10:00', '22:00-06:00']

// Colación adicional a partir de estas horas trabajadas.
export const HORAS_COLACION = 6

export const TURNOS_CONTRATISTA = ['08:50-18:00', '09:40-17:30']

const ANCLA_OFFSET = 3 // jueves, igual que el bono especial

const norm = (v) => String(v ?? '').trim()

const diaMarcaje = (r) =>
  aIso(r.dia_entrada) ?? aIso(r.entrada_format) ?? aIso(r.salida_format)

/** Date desde "yyyy/MM/dd HH:mm:ss" o "yyyy-MM-dd HH:mm:ss". */
function parseStamp(v) {
  const m = /^(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(norm(v))
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)))
}

/**
 * Horas trabajadas de una fila. null si falta alguna marca.
 *
 * Los campos *_format traen la fecha completa, así que un turno que cruza
 * medianoche se resuelve solo: no hay que sumarle un día a mano.
 */
export function horasTrabajadas(r) {
  const ini = parseStamp(r.entrada_format)
  const fin = parseStamp(r.salida_format)
  if (!ini || !fin) return null
  const h = (fin.getTime() - ini.getTime()) / 3_600_000
  return h > 0 ? h : null
}

const diaSemana = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export const esFinDeSemana = (iso) => [0, 6].includes(diaSemana(iso))
const nombreDia = (iso) => (diaSemana(iso) === 6 ? 'Sábado' : 'Domingo')

const hhmm = (h) =>
  `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

const nombreDe = (r) =>
  [r.nombre, r.apellido_paterno, r.apellido_materno].map(norm).filter(Boolean).join(' ')

const enRango = (iso, r) => (!r.desde || iso >= r.desde) && (!r.hasta || iso <= r.hasta)

const filtrar = (rows, periodo) =>
  rows.filter((r) => {
    const d = diaMarcaje(r)
    return d !== null && enRango(d, periodo)
  })

/** "yyyy-mm" -> [primer día, último día] de ese mes. */
export function mesCompleto(mes) {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate() // día 0 del mes siguiente
  const mm = String(m).padStart(2, '0')
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${ultimo}` }
}

/** El bono del mes X se paga en X+1. */
export function mesDePago(mes) {
  const [y, m] = mes.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * Días del periodo pedido que el dataset del tab no cubre; null si está completo.
 *
 * El bono se calcula sobre lo que el tab consultó: si el rango de la tabla es más
 * corto que el periodo del bono, el archivo sale incompleto y nada lo delata.
 */
export function faltaCobertura(rows, periodo) {
  const dias = rows.map(diaMarcaje).filter(Boolean).sort()
  if (dias.length === 0) return 'el tab no tiene marcajes cargados'
  const min = dias[0]
  const max = dias[dias.length - 1]
  if (periodo.desde && periodo.desde < min) return `faltan datos antes del ${min}`
  if (periodo.hasta && periodo.hasta > max) return `faltan datos después del ${max}`
  return null
}

// === 1. Colación y Movilización ===

/** Una fila por día de fin de semana trabajado dentro del periodo. */
export function colacionMovilizacion(rows, periodo = { desde: '', hasta: '' }) {
  const out = []
  for (const r of filtrar(rows, periodo)) {
    const fecha = diaMarcaje(r)
    if (!esFinDeSemana(fecha)) continue
    const rut = norm(r.rut_trabajador)
    if (!rut) continue
    const turno = norm(r.turno)
    if (TURNOS_EXCLUIDOS.includes(turno)) continue
    const horas = horasTrabajadas(r)
    out.push({
      rut,
      nombre: nombreDe(r),
      unidad: norm(r.area),
      cargo: norm(r.especialidad),
      fecha,
      dia: nombreDia(fecha),
      turno,
      horas,
      movilizacion: true, // trabajó sáb/dom en un turno no excluido
      colacion: horas !== null && horas >= HORAS_COLACION,
    })
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre))
}

const COLS_FINDE = [
  'Rut', 'Nombre Completo', 'Unidad', 'Cargo', 'Fecha', 'Día', 'Turno',
  'Horas trabajadas', 'Movilización', 'Colación', 'Asignaciones del día',
]

const siNo = (b) => (b ? 'Sí' : 'No')

const hojaFinde = (filas) =>
  filas.map((f) => ({
    Rut: f.rut,
    'Nombre Completo': f.nombre,
    Unidad: f.unidad,
    Cargo: f.cargo,
    Fecha: f.fecha,
    'Día': f.dia,
    Turno: f.turno,
    'Horas trabajadas': f.horas === null ? '—' : hhmm(f.horas),
    'Movilización': siNo(f.movilizacion),
    'Colación': siNo(f.colacion),
    'Asignaciones del día': Number(f.movilizacion) + Number(f.colacion),
  }))

const COLS_RESUMEN_FINDE = [
  'Rut', 'Nombre Completo', 'Unidad', 'Cargo',
  'Sábados', 'Domingos', 'Días trabajados',
  'Asignaciones movilización', 'Asignaciones colación', 'Total asignaciones',
]

/** Totales por trabajador. Las asignaciones se acumulan, no se consolidan. */
export function resumenFinde(filas) {
  const por = new Map()
  for (const f of filas) {
    let w = por.get(f.rut)
    if (!w) {
      w = {
        Rut: f.rut, 'Nombre Completo': f.nombre, Unidad: f.unidad, Cargo: f.cargo,
        'Sábados': 0, 'Domingos': 0, 'Días trabajados': 0,
        'Asignaciones movilización': 0, 'Asignaciones colación': 0, 'Total asignaciones': 0,
      }
      por.set(f.rut, w)
    }
    const inc = (k, n = 1) => { w[k] += n }
    inc(f.dia === 'Sábado' ? 'Sábados' : 'Domingos')
    inc('Días trabajados')
    if (f.movilizacion) { inc('Asignaciones movilización'); inc('Total asignaciones') }
    if (f.colacion) { inc('Asignaciones colación'); inc('Total asignaciones') }
  }
  return [...por.values()].sort((a, b) =>
    String(a['Nombre Completo']).localeCompare(String(b['Nombre Completo'])))
}

export function construirLibroColMov(rows, periodo) {
  const filas = colacionMovilizacion(rows, periodo)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb, XLSX.utils.json_to_sheet(resumenFinde(filas), { header: COLS_RESUMEN_FINDE }), 'Resumen'
  )
  XLSX.utils.book_append_sheet(
    wb, XLSX.utils.json_to_sheet(hojaFinde(filas), { header: COLS_FINDE }), 'Detalle por día'
  )
  return wb
}

/**
 * Prepara la descarga. Devuelve qué pasó en vez de abrir diálogos, para que la UI
 * decida cómo avisar: `confirmar` es una advertencia de cobertura que el usuario
 * puede ignorar; `mensaje` sin filas es un no-hay-nada-que-bajar.
 */
export function prepararColMov(rows, periodo) {
  const filas = colacionMovilizacion(rows, periodo)
  if (filas.length === 0) {
    return {
      ok: false,
      mensaje: 'Sin sábados ni domingos trabajados en el periodo (fuera de los turnos excluidos).',
    }
  }
  return {
    ok: true,
    filas: filas.length,
    confirmar: faltaCobertura(rows, periodo),
    descargar: () =>
      XLSX.writeFile(
        construirLibroColMov(rows, periodo),
        `colacion_movilizacion_${periodo.desde}_${periodo.hasta}.xlsx`
      ),
  }
}

// === 2. Bono Contratista ===

/**
 * Agrupa los turnos de contratista del mes, con cada semana anclada a su jueves.
 * La semana se paga en el mes que contiene el ancla, así que una semana partida
 * entre dos meses cae en uno solo.
 */
export function agruparContratista(rows, mes) {
  const porRut = new Map()
  const semanas = new Map()

  for (const r of rows) {
    const turno = norm(r.turno)
    if (!TURNOS_CONTRATISTA.includes(turno)) continue
    const dia = diaMarcaje(r)
    if (!dia) continue
    const rut = norm(r.rut_trabajador)
    if (!rut) continue

    const ini = inicioSemana(dia)
    let semana = semanas.get(ini)
    if (!semana) {
      const ancla = desplazar(ini, ANCLA_OFFSET)
      semana = { ancla, dias: 0, contada: enRango(ancla, mes) }
      semanas.set(ini, semana)
    }
    semana.dias++
    if (!semana.contada) continue

    let w = porRut.get(rut)
    if (!w) {
      w = { rut, nombre: nombreDe(r), unidad: norm(r.area), cargo: norm(r.especialidad),
            turnos: new Set(), semanas: new Set(), dias: new Set() }
      porRut.set(rut, w)
    }
    w.turnos.add(turno)
    w.semanas.add(ini)
    w.dias.add(dia)
  }

  const numero = new Map()
  ;[...semanas.entries()]
    .filter(([, v]) => v.contada)
    .map(([ini]) => ini)
    .sort()
    .forEach((ini, i) => numero.set(ini, i + 1))

  const seguimiento = [...semanas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ini, v]) => ({
      inicio: ini,
      ancla: v.ancla,
      mes: v.ancla.slice(0, 7),
      mesPago: mesDePago(v.ancla.slice(0, 7)),
      dias: v.dias,
      contada: v.contada,
      semana: numero.get(ini) ?? null,
    }))

  return { trabajadores: [...porRut.values()], numero, seguimiento }
}

const COLS_CONTRATISTA = [
  'Rut', 'Nombre Completo', 'Unidad', 'Cargo', 'Turnos',
  'Semanas asignadas', 'Semanas', 'Días trabajados', 'Fechas',
]

const hojaContratista = (agg) =>
  agg.trabajadores.map((w) => {
    const semanas = [...w.semanas].map((ini) => agg.numero.get(ini)).sort((a, b) => a - b)
    return {
      Rut: w.rut,
      'Nombre Completo': w.nombre,
      Unidad: w.unidad,
      Cargo: w.cargo,
      Turnos: [...w.turnos].sort().join(', '),
      'Semanas asignadas': w.semanas.size, // una asignación por semana con turno
      Semanas: semanas.map((n) => `Semana ${n}`).join(', '),
      'Días trabajados': w.dias.size,
      Fechas: [...w.dias].sort().join(', '),
    }
  })

const COLS_SEG_CONTRATISTA = [
  'Mes trabajado', 'Mes de pago', 'Semana', 'Rango semana', 'Día ancla (jueves)',
  'Días con turno', 'Se paga en este mes',
]

const hojaSeguimientoContratista = (agg) =>
  agg.seguimiento.map((t) => ({
    'Mes trabajado': t.mes,
    'Mes de pago': t.mesPago,
    Semana: t.semana ? `Semana ${t.semana}` : '—',
    'Rango semana': `${t.inicio} a ${desplazar(t.inicio, 6)}`,
    'Día ancla (jueves)': t.ancla,
    'Días con turno': t.dias,
    'Se paga en este mes': t.contada ? 'Sí' : 'No (otro mes)',
  }))

export function construirLibroContratista(rows, mes) {
  const agg = agruparContratista(rows, mesCompleto(mes))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb, XLSX.utils.json_to_sheet(hojaContratista(agg), { header: COLS_CONTRATISTA }),
    'Bono Contratista'
  )
  XLSX.utils.book_append_sheet(
    wb, XLSX.utils.json_to_sheet(hojaSeguimientoContratista(agg), { header: COLS_SEG_CONTRATISTA }),
    'Seguimiento Ancla'
  )
  return wb
}

export function prepararContratista(rows, mes) {
  const periodo = mesCompleto(mes)
  const agg = agruparContratista(rows, periodo)
  if (agg.trabajadores.length === 0) {
    return {
      ok: false,
      mensaje: `Sin turnos de contratista (${TURNOS_CONTRATISTA.join(', ')}) anclados en ${mes}.`,
    }
  }
  return {
    ok: true,
    filas: agg.trabajadores.length,
    confirmar: faltaCobertura(rows, periodo),
    descargar: () =>
      XLSX.writeFile(construirLibroContratista(rows, mes), `bono_contratista_${mes}.xlsx`),
  }
}

// Check: `node frontend/src/features/asistencia/bonosAdicionales.js`
if (globalThis.process?.argv?.[1]?.endsWith('bonosAdicionales.js')) {
  const a = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg) }

  const marca = (rut, dia, turno, ini, fin) => ({
    rut_trabajador: rut, nombre: 'N', apellido_paterno: 'A', area: 'U', especialidad: 'Operario',
    turno, dia_entrada: dia, entrada_format: ini, salida_format: fin,
  })

  a(esFinDeSemana('2026-08-15') && esFinDeSemana('2026-08-16'), 'sábado y domingo')
  a(!esFinDeSemana('2026-08-17'), 'el lunes no')
  a(horasTrabajadas(marca('1-9', '15/8/2026', 'T', '2026/08/15 08:00:00', '2026/08/15 18:00:00')) === 10,
    'diez horas')
  a(horasTrabajadas(marca('1-9', '15/8/2026', 'T', '2026/08/15 22:00:00', '2026/08/16 06:00:00')) === 8,
    'turno que cruza medianoche: ocho horas')

  // Recurrencia: tres días de fin de semana son seis asignaciones, no dos.
  const q = { desde: '2026-08-01', hasta: '2026-08-15' }
  const recurrente = [
    marca('1-9', '1/8/2026', '08:00-18:00', '2026/08/01 08:00:00', '2026/08/01 18:00:00'),
    marca('1-9', '2/8/2026', '08:00-18:00', '2026/08/02 08:00:00', '2026/08/02 18:00:00'),
    marca('1-9', '8/8/2026', '08:00-18:00', '2026/08/08 08:00:00', '2026/08/08 18:00:00'),
  ]
  const res = resumenFinde(colacionMovilizacion(recurrente, q))[0]
  a(res['Asignaciones movilización'] === 3, `movilizaciones: ${res['Asignaciones movilización']}`)
  a(res['Asignaciones colación'] === 3, `colaciones: ${res['Asignaciones colación']}`)
  a(res['Total asignaciones'] === 6, `total: ${res['Total asignaciones']}`)
  a(res['Sábados'] === 2 && res['Domingos'] === 1, 'dos sábados y un domingo')

  // Bajo el umbral: movilización sí, colación no.
  const corto = resumenFinde(colacionMovilizacion([
    marca('2-7', '1/8/2026', '08:00-12:00', '2026/08/01 08:00:00', '2026/08/01 12:00:00'),
    marca('2-7', '2/8/2026', '08:00-12:00', '2026/08/02 08:00:00', '2026/08/02 12:00:00'),
  ], q))[0]
  a(corto['Asignaciones movilización'] === 2 && corto['Asignaciones colación'] === 0,
    'bajo seis horas no hay colación')
  a(corto['Total asignaciones'] === 2, 'dos asignaciones')

  // Turnos excluidos y días de semana quedan fuera.
  a(colacionMovilizacion([
    marca('3-5', '1/8/2026', '06:00-10:00', '2026/08/01 06:00:00', '2026/08/01 10:00:00'),
    marca('4-3', '1/8/2026', '22:00-06:00', '2026/08/01 22:00:00', '2026/08/02 06:00:00'),
    marca('5-1', '3/8/2026', '08:00-18:00', '2026/08/03 08:00:00', '2026/08/03 18:00:00'),
  ], q).length === 0, 'turnos excluidos y lunes fuera')

  // El periodo recorta: el sábado 22 queda fuera de la quincena.
  a(colacionMovilizacion([...recurrente,
    marca('1-9', '22/8/2026', '08:00-18:00', '2026/08/22 08:00:00', '2026/08/22 18:00:00')], q)
    .length === 3, 'el periodo recorta al 15')

  // Contratista: una asignación por semana, mes calendario completo.
  a(mesCompleto('2026-07').desde === '2026-07-01' && mesCompleto('2026-07').hasta === '2026-07-31', 'julio')
  a(mesCompleto('2026-02').hasta === '2026-02-28', 'febrero común')
  a(mesCompleto('2024-02').hasta === '2024-02-29', 'febrero bisiesto')
  a(mesDePago('2026-12') === '2027-01', 'diciembre se paga en enero')

  const cRows = [
    marca('10-1', '13/7/2026', '08:50-18:00', '2026/07/13 08:50:00', '2026/07/13 18:00:00'),
    marca('10-1', '14/7/2026', '09:40-17:30', '2026/07/14 09:40:00', '2026/07/14 17:30:00'),
    marca('10-1', '20/7/2026', '08:50-18:00', '2026/07/20 08:50:00', '2026/07/20 18:00:00'),
    marca('20-2', '13/7/2026', '07:50-17:00', '2026/07/13 07:50:00', '2026/07/13 17:00:00'),
  ]
  const agg = agruparContratista(cRows, mesCompleto('2026-07'))
  a(agg.trabajadores.length === 1 && agg.trabajadores[0].rut === '10-1', 'solo turnos de contratista')
  a(agg.trabajadores[0].semanas.size === 2, `semanas: ${agg.trabajadores[0].semanas.size}`)
  a(agg.trabajadores[0].dias.size === 3, 'tres días trabajados')
  a(agg.trabajadores[0].turnos.size === 2, 'ambos turnos registrados')
  a(agg.seguimiento[0].mes === '2026-07' && agg.seguimiento[0].mesPago === '2026-08',
    'julio se paga en agosto')

  // Semana partida entre meses: la ancla decide, sin doble pago ni omisión.
  const partida = [marca('30-3', '30/6/2026', '08:50-18:00', '2026/06/30 08:50:00', '2026/06/30 18:00:00')]
  a(agruparContratista(partida, mesCompleto('2026-06')).trabajadores.length === 0, 'junio no la paga')
  a(agruparContratista(partida, mesCompleto('2026-07')).trabajadores.length === 1, 'julio sí la paga')

  a(faltaCobertura(recurrente, { desde: '2026-08-01', hasta: '2026-08-15' }) !== null,
    'detecta que faltan datos después del 8')
  a(faltaCobertura(recurrente, { desde: '2026-08-01', hasta: '2026-08-08' }) === null, 'cobertura completa')

  const wb1 = construirLibroColMov(recurrente, q)
  a(wb1.SheetNames.join('|') === 'Resumen|Detalle por día', wb1.SheetNames.join('|'))
  const detalle = XLSX.utils.sheet_to_json(wb1.Sheets['Detalle por día'])
  a(detalle.length === 3 && detalle[0]['Asignaciones del día'] === 2, 'dos asignaciones por día')

  const wb2 = construirLibroContratista(cRows, '2026-07')
  a(wb2.SheetNames.join('|') === 'Bono Contratista|Seguimiento Ancla', wb2.SheetNames.join('|'))
  a(XLSX.utils.sheet_to_json(wb2.Sheets['Bono Contratista'])[0]['Semanas asignadas'] === 2,
    'dos semanas asignadas en la hoja')

  console.log('ok')
}
