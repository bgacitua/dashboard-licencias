/**
 * Bono especial: turno nocturno (20:00-06:30), calculado sobre las filas que el
 * tab Marcajes ya tiene en memoria. El .xlsx se arma en el navegador; no hay
 * backend involucrado.
 *
 * El punto delicado es la semana partida por el corte de periodo. Cada semana
 * ISO se ancla a su JUEVES, y se paga en el periodo cuyo rango contiene ese día.
 * Así una semana que cruza el corte se paga en un solo periodo —nunca doble,
 * nunca ninguno— y cada corrida lo decide sola, sin ver la otra mitad. La hoja
 * "Seguimiento Ancla" deja esa decisión auditable.
 */
import * as XLSX from 'xlsx'

import { aIso } from './marcas.js'

// El campo `turno` del marcaje trae este formato exacto.
export const TURNO_NOCHE = '20:00-06:30'

// Días desde el lunes hasta el ancla. Jueves = 3, la mayoría de la semana.
const ANCLA_OFFSET = 3

// Monto por semana según especialidad. ponytail: mapa fijo; agregar acá las que
// falten. Una especialidad no listada cae al monto por defecto.
const MONTOS = { operario: 100000, 'supervisor de planta': 150000 }
const MONTO_DEFECTO = 100000

const montoDe = (especialidad, montos) =>
  montos[String(especialidad ?? '').trim().toLowerCase()] ?? MONTO_DEFECTO

/** Fecha ISO desplazada N días. En UTC, para no arrastrar la zona horaria. */
export function desplazar(iso, dias) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + dias)
  return dt.toISOString().slice(0, 10)
}

/** Lunes de la semana ISO que contiene la fecha. Es la clave estable de la semana. */
export function inicioSemana(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7 // Lun=1..Dom=7
  return desplazar(iso, -(dow - 1))
}

/** Jueves de esa semana: el día que decide en qué periodo se paga. */
export const diaAncla = (iso) => desplazar(inicioSemana(iso), ANCLA_OFFSET)

const enPeriodo = (ancla, rango) => {
  if (rango?.desde && ancla < rango.desde) return false
  if (rango?.hasta && ancla > rango.hasta) return false
  return true
}

/** Día de la marca de entrada de una fila de Marcajes. */
const diaMarcaje = (r) =>
  aIso(r.dia_entrada) ?? aIso(r.entrada_format) ?? aIso(r.salida_format)

/**
 * Filtra el turno nocturno, ancla cada semana al periodo y agrupa por trabajador.
 *
 * Devuelve también `seguimiento`: todas las semanas vistas, incluidas las que se
 * pagan en otro periodo, para poder auditar por qué una semana no aparece.
 */
export function agregar(rows, rango) {
  const porRut = new Map()
  const semanas = new Map()

  for (const r of rows) {
    if (String(r.turno ?? '').trim() !== TURNO_NOCHE) continue
    const dia = diaMarcaje(r)
    if (!dia) continue
    const rut = String(r.rut_trabajador ?? '').trim()
    if (!rut) continue

    const ini = inicioSemana(dia)
    let semana = semanas.get(ini)
    if (!semana) {
      const ancla = desplazar(ini, ANCLA_OFFSET)
      semana = { ancla, dias: 0, contada: enPeriodo(ancla, rango) }
      semanas.set(ini, semana)
    }
    // Cuenta todos los marcajes-día, incluso los de semanas de otro periodo: esa
    // cifra es la que hace útil la hoja de seguimiento.
    semana.dias++
    if (!semana.contada) continue

    let w = porRut.get(rut)
    if (!w) {
      w = {
        rut,
        nombre: [r.nombre, r.apellido_paterno, r.apellido_materno]
          .map((v) => String(v ?? '').trim())
          .filter(Boolean)
          .join(' '),
        unidad: String(r.area ?? '').trim(),
        cargo: String(r.especialidad ?? '').trim(),
        turno: TURNO_NOCHE,
        dias: new Set(),
      }
      porRut.set(rut, w)
    }
    w.dias.add(dia)
  }

  // Solo las semanas que se pagan acá se numeran, en orden cronológico.
  const numero = new Map()
  ;[...semanas.entries()]
    .filter(([, v]) => v.contada)
    .map(([ini]) => ini)
    .sort()
    .forEach((ini, i) => numero.set(ini, i + 1))

  const seguimiento = [...semanas.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ini, v]) => ({
      mes: v.ancla.slice(0, 7),
      inicio: ini,
      ancla: v.ancla,
      dias: v.dias,
      contada: v.contada,
      semana: numero.get(ini) ?? null,
    }))

  return { trabajadores: [...porRut.values()], numero, seguimiento }
}

const semanasDe = (w, numero) =>
  [...new Set([...w.dias].map((d) => numero.get(inicioSemana(d))))].sort((a, b) => a - b)

/** Fechas agrupadas por mes: { "2026-04": ["13","14"] }. */
function fechasPorMes(dias) {
  const out = {}
  for (const d of [...dias].sort()) {
    const mes = d.slice(0, 7)
    ;(out[mes] ??= []).push(d.slice(8, 10))
  }
  return out
}

const COLS_RESUMEN = [
  'nombre', 'rut', 'unidad', 'cargo', 'fecha', 'tipo turno',
  'Contador días bono', 'Semanas', 'Monto',
]

const resumen = (agg, montos) =>
  agg.trabajadores.map((w) => {
    const semanas = semanasDe(w, agg.numero)
    return {
      nombre: w.nombre,
      rut: w.rut,
      unidad: w.unidad,
      cargo: w.cargo,
      fecha: JSON.stringify(fechasPorMes(w.dias)),
      'tipo turno': w.turno,
      'Contador días bono': w.dias.size,
      Semanas: semanas.map((n) => `Semana ${n}`).join(', '),
      Monto: semanas.length * montoDe(w.cargo, montos),
    }
  })

/**
 * Matriz trabajador × fecha, con la cabecera de semana fusionada sobre su bloque.
 *
 * Las columnas son las fechas de ese subconjunto, pero la numeración de semana es
 * la global: si la hoja de supervisores empieza en la semana 3, dice 3.
 */
function matriz(trabajadores, numero, montos) {
  const fechas = [...new Set(trabajadores.flatMap((w) => [...w.dias]))].sort()
  const CABECERA = 4 // Rut, Nombre Completo, Rut fmt, Cargo

  const filaSemanas = Array(CABECERA + fechas.length + 1).fill('')
  const merges = []
  let inicioBloque = 0
  for (let i = 0; i <= fechas.length; i++) {
    const actual = i < fechas.length ? inicioSemana(fechas[i]) : null
    const previa = inicioSemana(fechas[inicioBloque])
    if (actual !== previa || i === fechas.length) {
      const c0 = CABECERA + inicioBloque
      const c1 = CABECERA + i - 1
      filaSemanas[c0] = `Semana ${numero.get(previa)}`
      if (c1 > c0) merges.push({ s: { r: 0, c: c0 }, e: { r: 0, c: c1 } })
      inicioBloque = i
    }
  }

  const encabezado = ['Rut', 'Nombre Completo', 'Rut ', 'Cargo', ...fechas, 'Total general']
  const filas = trabajadores.map((w) => [
    w.rut.replace(/[.-]/g, ''),
    w.nombre,
    w.rut,
    w.cargo,
    ...fechas.map((d) => (w.dias.has(d) ? 1 : '')),
    semanasDe(w, numero).length * montoDe(w.cargo, montos),
  ])

  const ws = XLSX.utils.aoa_to_sheet([filaSemanas, encabezado, ...filas])
  if (merges.length) ws['!merges'] = merges
  return ws
}

const COLS_SEGUIMIENTO = [
  'Mes', 'Semana', 'Rango semana', 'Día ancla (jueves)',
  'Días con turno', 'Se paga en este periodo',
]

const seguimiento = (agg) =>
  agg.seguimiento.map((t) => ({
    Mes: t.mes,
    Semana: t.semana ? `Semana ${t.semana}` : '—',
    'Rango semana': `${t.inicio} a ${desplazar(t.inicio, 6)}`,
    'Día ancla (jueves)': t.ancla,
    'Días con turno': t.dias,
    'Se paga en este periodo': t.contada ? 'Sí' : 'No (otro periodo)',
  }))

const CARGO_OPERARIO = 'OPERARIO'
const CARGO_SUPERVISOR = 'SUPERVISOR DE PLANTA'
const esCargo = (w, cargo) => w.cargo.trim().toUpperCase() === cargo

export function construirLibro(rows, { montos = MONTOS, rango } = {}) {
  const agg = agregar(rows, rango)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb, XLSX.utils.json_to_sheet(resumen(agg, montos), { header: COLS_RESUMEN }),
    'Resumen Bono Especial'
  )
  XLSX.utils.book_append_sheet(
    wb, matriz(agg.trabajadores.filter((w) => esCargo(w, CARGO_OPERARIO)), agg.numero, montos),
    'Bono Especial'
  )
  XLSX.utils.book_append_sheet(
    wb, matriz(agg.trabajadores.filter((w) => esCargo(w, CARGO_SUPERVISOR)), agg.numero, montos),
    'Bono Supervisores Noche'
  )
  XLSX.utils.book_append_sheet(
    wb, XLSX.utils.json_to_sheet(seguimiento(agg), { header: COLS_SEGUIMIENTO }),
    'Seguimiento Ancla'
  )
  return wb
}

/**
 * Descarga el .xlsx desde las filas del tab Marcajes.
 * `rango` es el periodo aplicado, y es lo que ancla las semanas partidas.
 */
export function descargarBonoEspecial(rows, rango) {
  const agg = agregar(rows, rango)
  if (agg.trabajadores.length === 0) {
    return { ok: false, mensaje: `No hay turnos ${TURNO_NOCHE} pagables en el periodo filtrado.` }
  }
  XLSX.writeFile(construirLibro(rows, { rango }), 'bono_especial.xlsx')
  return { ok: true, trabajadores: agg.trabajadores.length }
}

// Check: `node frontend/src/features/asistencia/bonoEspecial.js`
if (globalThis.process?.argv?.[1]?.endsWith('bonoEspecial.js')) {
  const a = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg) }

  a(inicioSemana('2026-07-15') === '2026-07-13', 'lunes de la semana del 15 de julio')
  a(inicioSemana('2026-04-13') !== inicioSemana('2026-04-20'), 'semanas contiguas distintas')
  a(diaAncla('2026-07-13') === '2026-07-16', 'el ancla es el jueves')

  const rows = []
  const push = (rut, esp, dia, turno = TURNO_NOCHE) =>
    rows.push({ rut_trabajador: rut, nombre: 'N', apellido_paterno: 'A', especialidad: esp,
                area: 'U', turno, dia_entrada: dia })
  for (const d of ['13/4/2026', '14/4/2026', '15/4/2026', '16/4/2026',
                   '27/4/2026', '28/4/2026', '29/4/2026',
                   '11/5/2026', '12/5/2026', '13/5/2026']) push('12006327-8', 'Operario', d)
  for (const d of ['13/4/2026', '14/4/2026']) push('10000000-1', 'SUPERVISOR DE PLANTA', d)
  for (const d of ['20/4/2026', '21/4/2026']) push('20000000-2', 'Operario', d)
  for (const d of ['4/5/2026', '5/5/2026']) push('30000000-3', 'Operario', d)
  push('99999999-9', 'Operario', '13/4/2026', '07:50-17:00') // otro turno: se ignora

  const wb = construirLibro(rows)
  a(wb.SheetNames.join('|') ===
    'Resumen Bono Especial|Bono Especial|Bono Supervisores Noche|Seguimiento Ancla',
    `hojas: ${wb.SheetNames.join('|')}`)

  const r1 = XLSX.utils.sheet_to_json(wb.Sheets['Resumen Bono Especial'])
  const jorge = r1.find((r) => r.rut === '12006327-8')
  // Tres semanas distintas de Operario, no diez días: el bono es semanal.
  a(jorge.Monto === 300000, `monto ${jorge.Monto}`)
  a(jorge.Semanas === 'Semana 1, Semana 3, Semana 5', `semanas ${jorge.Semanas}`)
  a(jorge['Contador días bono'] === 10, 'diez días con turno')
  a(r1.find((r) => r.rut === '10000000-1').Monto === 150000, 'supervisor: una semana a 150000')

  const oper = XLSX.utils.sheet_to_json(wb.Sheets['Bono Especial'], { header: 1 })
  const superv = XLSX.utils.sheet_to_json(wb.Sheets['Bono Supervisores Noche'], { header: 1 })
  const ruts = (m) => m.slice(2).map((r) => r[0])
  a(!ruts(oper).includes('100000001'), 'la hoja de operarios no trae al supervisor')
  a(ruts(superv).length === 1 && ruts(superv)[0] === '100000001', 'supervisores: solo el supervisor')

  // Semana partida por el corte: el ancla (jueves 16) decide dónde se paga.
  const partida = []
  const pushP = (dia) => partida.push({ rut_trabajador: '40000000-4', nombre: 'N',
    especialidad: 'Operario', area: 'U', turno: TURNO_NOCHE, dia_entrada: dia })

  ;['13/7/2026', '14/7/2026'].forEach(pushP)
  const p1 = agregar(partida, { desde: '2026-07-01', hasta: '2026-07-14' })
  a(p1.trabajadores.length === 0, 'el periodo 1 no paga la semana partida')
  a(p1.seguimiento.length === 1 && !p1.seguimiento[0].contada, 'el seguimiento la marca no contada')
  a(p1.seguimiento[0].ancla === '2026-07-16' && p1.seguimiento[0].mes === '2026-07', 'ancla y mes')

  const partida2 = []
  ;['15/7/2026', '16/7/2026', '17/7/2026'].forEach((dia) => partida2.push({
    rut_trabajador: '40000000-4', especialidad: 'Operario', area: 'U',
    turno: TURNO_NOCHE, dia_entrada: dia }))
  const p2 = agregar(partida2, { desde: '2026-07-15', hasta: '2026-07-28' })
  a(p2.trabajadores.length === 1 && p2.trabajadores[0].dias.size === 3,
    'el periodo 2 sí paga la semana partida')
  a(p2.seguimiento[0].contada && p2.seguimiento[0].semana === 1, 'queda numerada como semana 1')

  console.log('ok')
}
