/**
 * Parseo de los archivos que se suben en Inasistencias y Corrección de marcas.
 *
 * Tres archivos distintos, todos leídos en el navegador:
 *   - Marcas Fallidas / intentos de marcaje: recupera la hora real del intento.
 *   - Jornadas Incompletas: días-persona con una marca faltante.
 *   - Reporte de inasistencias por recinto: reemplaza la consulta a la API.
 */
import * as XLSX from 'xlsx'

import { aIso, claveAsignacion, fechaIso, limpiarRut, parseTurno } from './marcas.js' // extensión explícita: así el self-check corre con node

// Cabeceras del reporte de intentos de marcaje.
export const COLUMNAS_INTENTOS = [
  'ID Dispositivo', 'Nombre', 'RUT', 'Error al marcar', 'Sentido', 'Fecha intento', 'Hora intento',
]

// Mínimas para cruzar por RUT + fecha. Si falta alguna, el archivo se rechaza.
const REQUERIDAS = ['RUT', 'Fecha intento', 'Hora intento']

const ERROR_SIN_PERMISO = 'El colaborador no tiene permiso en este recinto'
const VENTANA_HORAS = 2

// Motivo que se manda a Buk con cada marca. El default depende de por qué
// falta: si hubo un intento real de marcaje, la marca existía y se está
// corrigiendo su sentido; si no hubo intento, el colaborador olvidó marcar.
export const MOTIVO_CORRECCION = 'Corrección Sentido Marca'
export const MOTIVO_OLVIDO = 'Olvido de marca'
export const MOTIVOS = [MOTIVO_CORRECCION, MOTIVO_OLVIDO, 'Otro']

export const motivoPorDefecto = (marca) =>
  marca.matched ? MOTIVO_CORRECCION : MOTIVO_OLVIDO

// ponytail: agregar turnos acá cuando se necesiten.
export const TURNOS_DISPONIBLES = ['07:50-17:00', '07:50-14:30', '07:50-15:30', '20:00-06:30']

/** Lee un xls/xlsx/csv y devuelve las filas de la primera hoja. */
export async function leerPlanilla(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
}

/** Diagnóstico de un archivo de intentos: qué se pudo usar y qué no. */
export function validarIntentos(rows) {
  const total = rows.length
  if (total === 0) {
    return { ok: false, faltantes: [...REQUERIDAS], total, fechasInvalidas: 0, rutsInvalidos: 0, validas: 0 }
  }
  const cols = new Set(Object.keys(rows[0]))
  const faltantes = REQUERIDAS.filter((c) => !cols.has(c))
  if (faltantes.length) {
    return { ok: false, faltantes, total, fechasInvalidas: 0, rutsInvalidos: 0, validas: 0 }
  }
  let fechasInvalidas = 0
  let rutsInvalidos = 0
  let validas = 0
  for (const r of rows) {
    const fechaOk = aIso(r['Fecha intento']) !== null
    const rutOk = limpiarRut(r['RUT'] ?? '') !== ''
    if (!fechaOk) fechasInvalidas++
    if (!rutOk) rutsInvalidos++
    if (fechaOk && rutOk) validas++
  }
  return { ok: true, faltantes: [], total, fechasInvalidas, rutsInvalidos, validas }
}

/** Template del archivo de intentos, con las cabeceras exactas. */
export function descargarTemplateIntentos() {
  const ejemplo = [
    { 'ID Dispositivo': '1', Nombre: 'ANA SOTO', RUT: '26.258.345-7', 'Error al marcar': '', Sentido: '', 'Fecha intento': '23-06-2026', 'Hora intento': '07:52:00' },
    { 'ID Dispositivo': '1', Nombre: 'ANA SOTO', RUT: '26.258.345-7', 'Error al marcar': '', Sentido: '', 'Fecha intento': '23-06-2026', 'Hora intento': '16:52:00' },
  ]
  const ws = XLSX.utils.json_to_sheet(ejemplo, { header: COLUMNAS_INTENTOS })
  // "Fecha intento" (columna F) a texto: si no, Excel la reinterpreta como fecha.
  for (let i = 2; i <= ejemplo.length + 1; i++) {
    if (ws[`F${i}`]) ws[`F${i}`].t = 's'
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Intentos')
  XLSX.writeFile(wb, 'template-intentos-marcaje.xlsx')
}

/** Descarta los intentos por falta de permiso en el recinto y ordena por RUT. */
export function filtrarYOrdenar(rows) {
  return rows
    .filter((r) => r['Error al marcar']?.trim() !== ERROR_SIN_PERMISO)
    .sort((a, b) => String(a['RUT']).localeCompare(String(b['RUT'])))
}

const aMinutos = (hhmm) => {
  const p = hhmm.trim().split(':')
  return Number(p[0]) * 60 + Number(p[1])
}

/**
 * A qué marca corresponde la hora de un intento, con ventana de ±2 h.
 * En la laguna entre ambas ventanas queda "ambiguo": no se asigna sola.
 */
export function clasificar(horaIntento, turnoInicio, turnoFin) {
  let intento = aMinutos(horaIntento)
  const inicio = aMinutos(turnoInicio)
  let fin = aMinutos(turnoFin)
  const ventana = VENTANA_HORAS * 60

  if (fin < inicio) {
    // Turno nocturno: la madrugada pertenece al día siguiente del turno.
    if (intento <= fin + ventana) intento += 1440
    fin += 1440
  }

  if (intento <= inicio + ventana) return 'entrada'
  if (intento >= fin - ventana) return 'salida'
  return 'ambiguo'
}

/** Clave rut|fecha de una fila de intentos. */
export function claveIntento(m) {
  return `${limpiarRut(m['RUT'] ?? '')}|${aIso(m['Fecha intento']) ?? ''}`
}

/** "HH:MM:SS" -> "H:m:s" sin ceros (formato que pide Buk). */
export function horaApiDesdeHms(hhmmss) {
  const p = hhmmss.trim().split(':')
  return `${Number(p[0])}:${Number(p[1])}:${Number(p[2] ?? 0)}`
}

/** "yyyy-mm-dd" -> "d/M/yyyy". */
export function fechaApiDesdeIso(iso) {
  const [yyyy, mm, dd] = iso.split('-')
  return `${Number(dd)}/${Number(mm)}/${yyyy}`
}

/** "H:m:s" -> "HH:MM:SS", el formato que pide <input type="time">. '' si no calza. */
export function hmsDesdeHoraApi(hms) {
  const p = String(hms ?? '').trim().split(':')
  if (p.length < 2 || p.some((x) => !/^\d+$/.test(x))) return ''
  const [h, m, sg = '0'] = p
  if (Number(h) > 23 || Number(m) > 59 || Number(sg) > 59) return ''
  return [h, m, sg].map((x) => String(Number(x)).padStart(2, '0')).join(':')
}

/** "d/M/yyyy" -> "yyyy-mm-dd", el formato que pide <input type="date">. '' si no calza. */
export function isoDesdeFechaApi(fecha) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(fecha ?? '').trim())
  if (!m) return ''
  const [, dd, mm, yyyy] = m
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return ''
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}

function agruparPorClave(intentos) {
  const m = new Map()
  for (const r of intentos) {
    const k = claveIntento(r)
    if (k.endsWith('|')) continue // fecha ilegible
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return m
}

/**
 * Reemplaza la hora del turno por la hora real del intento, cuando hay uno que
 * cruza por RUT + fecha y clasifica al mismo sentido.
 *
 * Con varios intentos del mismo sentido en un día gana el más tardío. Un intento
 * "ambiguo" no se asigna: la marca conserva la hora del turno.
 */
export function aplicarIntentos(marcas, intentos) {
  const segs = (h) => h.split(':').reduce((a, p) => a * 60 + Number(p), 0)
  const porClave = agruparPorClave(intentos)
  return marcas.map((m) => {
    const candidatos = porClave.get(m.key)
    if (!candidatos?.length) return m
    const turno = parseTurno(m.turno)
    let mejor = ''
    for (const c of candidatos) {
      const hora = String(c['Hora intento'] ?? '').trim()
      if (!hora) continue
      const sentido = turno ? clasificar(hora, turno[0], turno[1]) : m.i
      if (sentido === m.i && (!mejor || segs(hora) > segs(mejor))) mejor = hora
    }
    return mejor ? { ...m, hora: horaApiDesdeHms(mejor), matched: true } : m
  })
}

/**
 * Filas de Corrección de marcas: una por jornada incompleta.
 *
 * El turno sale de la asignación y define el sentido del intento (±2 h). Una
 * jornada sin intento que cruce queda como fila manual, con hora y sentido a
 * completar por el usuario.
 */
export function construirJornadas(jornadas, marcasFallidas, asignaciones = []) {
  const porClave = agruparPorClave(marcasFallidas)

  const turnos = new Map()
  for (const r of asignaciones) {
    const k = claveAsignacion(r)
    if (k && !turnos.has(k)) turnos.set(k, r)
  }

  const usados = new Map()
  const out = []

  for (const j of jornadas) {
    const rut = String(j['RUT'] ?? '')
    const fecha = aIso(j['Fecha']) ?? ''
    if (!fecha) continue
    const clave = `${limpiarRut(rut)}|${fecha}`

    // "Nombre" a veces ya viene completo: no re-anexar el apellido si ya está.
    const nombreRaw = String(j['Nombre'] ?? '').trim()
    const apellido = String(j['Primer Apellido'] ?? '').trim()
    const nombre =
      apellido && !nombreRaw.toUpperCase().includes(apellido.toUpperCase())
        ? `${nombreRaw} ${apellido}`.trim()
        : nombreRaw

    const asignacion = turnos.get(clave)
    const turno = asignacion ? parseTurno(asignacion.horarioTurno) : null
    const turnoInicio = turno?.[0] ?? ''
    const turnoFin = turno?.[1] ?? ''

    const agregar = (horaIntento, matched) => {
      let sentido = 'entrada'
      let ambiguo = false
      if (turno && horaIntento) {
        const clase = clasificar(horaIntento, turnoInicio, turnoFin)
        ambiguo = clase === 'ambiguo'
        sentido = clase === 'salida' ? 'salida' : 'entrada'
      }
      // Un mismo día puede traer dos intentos del mismo sentido: el id se numera
      // para que las filas no colisionen en la tabla.
      const base = `${clave}|${sentido}`
      const n = (usados.get(base) ?? 0) + 1
      usados.set(base, n)
      out.push({
        id: n === 1 ? base : `${base}|${n}`,
        rut, nombre, fecha, horaIntento, sentido, ambiguo,
        sinTurno: !turno, turnoInicio, turnoFin, matched,
      })
    }

    const cruces = porClave.get(clave) ?? []
    if (cruces.length) cruces.forEach((m) => agregar(String(m['Hora intento'] ?? ''), true))
    else agregar('', false)
  }

  return out
}

// === Reporte de inasistencias subido a mano ===
// Las cabeceras cambian según de dónde se exporte. En vez de tocar todo el
// pipeline (que lee DNI + ano/mes/dia), la fila se normaliza al entrar: se
// detecta la columna de RUT y la de fecha y se inyectan esos campos.

const VISIBLES = [
  /^rut$|dni/i, /^nombre/i, /apellido/i, /^[áa]rea/i, /turno/i,
  /fecha|^d[ií]a$/i, /motivo/i, /observaci/i,
]

/** Columnas del archivo que vale la pena mostrar. Sin coincidencias, todas. */
export function columnasVisibles(columns) {
  const vis = columns.filter((c) => VISIBLES.some((re) => re.test(c.trim())))
  return vis.length ? vis : columns
}

const detectar = (cols, re) => cols.find((c) => re.test(c)) ?? ''

export function normalizarReporte(raw) {
  const vacio = { rows: [], columns: [] }
  if (raw.length === 0) {
    return { ...vacio, diag: { ok: false, error: 'El archivo no tiene filas de datos.', rutCol: '', fechaCol: '', total: 0, validas: 0 } }
  }
  const columns = Object.keys(raw[0]).map((c) => c.trim())
  const filas = raw.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), v])))

  const rutCol = detectar(columns, /rut|dni/i)
  if (!rutCol) {
    return { ...vacio, diag: { ok: false, error: `No encuentro una columna de RUT/DNI. Cabeceras leídas: ${columns.join(' · ')}.`, rutCol: '', fechaCol: '', total: raw.length, validas: 0 } }
  }

  // ano/mes/dia se chequea primero: si no, "dia" se confundiría con la columna
  // "Día" del reporte.
  const porPartes = ['ano', 'mes', 'dia'].every((c) => columns.includes(c))
  const fechaCol = porPartes ? '' : detectar(columns, /fecha|^d[ií]a$/i)
  if (!fechaCol && !porPartes) {
    return { ...vacio, diag: { ok: false, error: `No encuentro una columna de fecha (ni ano/mes/dia). Cabeceras leídas: ${columns.join(' · ')}.`, rutCol, fechaCol: '', total: raw.length, validas: 0 } }
  }

  const rows = []
  for (const r of filas) {
    const rut = String(r[rutCol] ?? '').trim()
    const iso = porPartes ? fechaIso(r) : aIso(r[fechaCol])
    if (!rut || limpiarRut(rut) === '' || !iso) continue
    const [ano, mes, dia] = iso.split('-')
    rows.push({ ...r, DNI: rut, ano: Number(ano), mes: Number(mes), dia: Number(dia) })
  }

  return {
    rows,
    columns,
    diag: {
      ok: rows.length > 0,
      error: rows.length ? '' : 'Ninguna fila tiene RUT y fecha legibles.',
      rutCol, fechaCol, total: raw.length, validas: rows.length,
    },
  }
}

/** Rango (min/max) de filas ya normalizadas. */
export function rangoDeReporte(rows) {
  const fechas = rows.map((r) => fechaIso(r)).sort()
  return { desde: fechas[0] ?? '', hasta: fechas[fechas.length - 1] ?? '' }
}

/** Rango (min/max) del archivo de jornadas incompletas. */
export function rangoDeJornadas(rows) {
  const fechas = rows.map((r) => aIso(r['Fecha']) ?? '').filter(Boolean).sort()
  return { desde: fechas[0] ?? '', hasta: fechas[fechas.length - 1] ?? '' }
}

// === Ingreso manual ===
// Mismo destino que las otras pestañas (una marca en Buk), pero el usuario
// escribe las filas o sube una planilla con las cuatro columnas mínimas.

export const COLUMNAS_MANUAL = ['RUT', 'Fecha', 'Hora', 'Sentido']

let _secuencia = 0
export const proximoId = () => `m${++_secuencia}`

/** Fecha en los formatos que usa la gente -> yyyy-mm-dd. */
export function normalizarFecha(raw) {
  const s = String(raw ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const barras = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (barras) return `${barras[3]}-${barras[2].padStart(2, '0')}-${barras[1].padStart(2, '0')}`
  const guiones = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s)
  if (guiones) return `${guiones[3]}-${guiones[2].padStart(2, '0')}-${guiones[1].padStart(2, '0')}`
  return s
}

/** HH:MM -> HH:MM:SS. */
export function normalizarHora(raw) {
  const s = String(raw ?? '').trim()
  return /^\d{1,2}:\d{2}$/.test(s) ? `${s}:00` : s
}

export function normalizarSentido(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'entrada' || v === 'e') return 'entrada'
  if (v === 'salida' || v === 's') return 'salida'
  return null
}

/** Template del ingreso manual, con las cabeceras exactas. */
export function descargarTemplateManual() {
  const ejemplo = [
    { RUT: '26.258.345-7', Fecha: '23-06-2026', Hora: '07:52:00', Sentido: 'entrada' },
    { RUT: '26.258.345-7', Fecha: '23-06-2026', Hora: '16:52:00', Sentido: 'salida' },
  ]
  const ws = XLSX.utils.json_to_sheet(ejemplo, { header: COLUMNAS_MANUAL })
  // "Fecha" (columna B) a texto: si no, Excel la reinterpreta.
  for (let i = 2; i <= ejemplo.length + 1; i++) {
    if (ws[`B${i}`]) ws[`B${i}`].t = 's'
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ingreso Manual')
  XLSX.writeFile(wb, 'template-ingreso-manual.xlsx')
}

/**
 * Filas de una planilla de ingreso manual.
 *
 * Las cabeceras se detectan sin distinguir mayúsculas y aceptando los alias más
 * comunes. Una fila con sentido ilegible se reporta en vez de descartarse en
 * silencio: son marcas que van a quedar en Buk.
 */
export function leerIngresoManual(raw) {
  if (!raw.length) return { records: [], errors: ['El archivo está vacío.'] }

  const buscar = (nombres) =>
    Object.keys(raw[0]).find((k) => nombres.includes(k.toLowerCase().trim())) ?? null

  const colRut = buscar(['rut trabajador', 'rut', 'dni'])
  const colFecha = buscar(['fecha marca', 'fecha', 'fecha jornada', 'date'])
  const colHora = buscar(['hora marca', 'hora', 'hora intento', 'time'])
  const colSentido = buscar(['sentido', 'i', 'direction'])

  const faltan = [
    !colRut && 'RUT', !colFecha && 'Fecha', !colHora && 'Hora', !colSentido && 'Sentido',
  ].filter(Boolean)
  if (faltan.length) {
    return {
      records: [],
      errors: [`Faltan columnas: ${faltan.join(', ')}. Cabeceras leídas: ${Object.keys(raw[0]).join(', ')}.`],
    }
  }

  const records = []
  const errors = []
  raw.forEach((fila, i) => {
    const rut = String(fila[colRut] ?? '').trim()
    const fecha = String(fila[colFecha] ?? '').trim()
    if (!rut && !fecha) return // fila vacía
    const sentido = normalizarSentido(fila[colSentido])
    if (!sentido) {
      errors.push(`Fila ${i + 2}: sentido inválido “${fila[colSentido]}” (se espera entrada/salida).`)
      return
    }
    records.push({
      id: proximoId(),
      rut,
      fecha: normalizarFecha(fecha),
      hora: normalizarHora(fila[colHora]),
      sentido,
    })
  })
  return { records, errors }
}

// Check: `node frontend/src/features/asistencia/correccion.js`
if (globalThis.process?.argv?.[1]?.endsWith('correccion.js')) {
  const a = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg) }

  a(clasificar('07:00', '08:00', '17:00') === 'entrada', 'antes del inicio')
  a(clasificar('09:59', '08:00', '17:00') === 'entrada', 'dentro de la ventana de inicio')
  a(clasificar('10:01', '08:00', '17:00') === 'ambiguo', 'laguna entre ventanas')
  a(clasificar('15:01', '08:00', '17:00') === 'salida', 'dentro de la ventana de fin')
  a(clasificar('18:00', '08:00', '17:00') === 'salida', 'después del fin')
  a(clasificar('06:23', '20:00', '06:30') === 'salida', 'madrugada de turno nocturno')
  a(clasificar('20:05', '20:00', '06:30') === 'entrada', 'inicio de turno nocturno')

  a(fechaApiDesdeIso('2026-06-15') === '15/6/2026', 'fecha api')
  a(horaApiDesdeHms('07:50:00') === '7:50:0', 'hora api')
  a(hmsDesdeHoraApi('7:50:0') === '07:50:00', 'hora api -> input time')
  a(hmsDesdeHoraApi('17:5') === '17:05:00', 'hora api sin segundos')
  a(hmsDesdeHoraApi('25:00:00') === '', 'hora fuera de rango')
  a(hmsDesdeHoraApi('mediodia') === '', 'hora ilegible')
  a(isoDesdeFechaApi('15/6/2026') === '2026-06-15', 'fecha api -> input date')
  a(isoDesdeFechaApi('15-06-2026') === '', 'fecha con separador equivocado')
  a(isoDesdeFechaApi('15/13/2026') === '', 'mes fuera de rango')

  const jornadas = [
    { Fecha: '11-06-2026', RUT: '26258345-7', 'Primer Apellido': 'SOTO', Nombre: 'ANA' },
    { Fecha: '12-06-2026', RUT: '26258345-7', 'Primer Apellido': 'SOTO', Nombre: 'ANA' },
  ]
  const fallidas = [{
    'ID Dispositivo': '1', Nombre: 'ANA', RUT: '26258345-7', 'Error al marcar': 'x',
    Sentido: '', 'Fecha intento': '11-06-2026', 'Hora intento': '16:52:00',
  }]
  const asignaciones = [
    { dni: '26258345-7', horarioTurno: '07:50-17:00', diaTurno: '11-06-2026' },
    { dni: '26258345-7', horarioTurno: '07:50-17:00', diaTurno: '12-06-2026' },
  ]

  const filas = construirJornadas(jornadas, fallidas, asignaciones)
  a(filas.length === 2, 'una fila por jornada')
  const cruzada = filas.find((r) => r.fecha === '2026-06-11')
  a(cruzada.matched && cruzada.horaIntento === '16:52:00', 'la jornada del 11 cruza')
  a(cruzada.sentido === 'salida', '16:52 con turno 07:50-17:00 es salida')
  a(!cruzada.ambiguo && !cruzada.sinTurno, 'turno presente')
  a(cruzada.nombre === 'ANA SOTO', 'nombre mas apellido')

  const manual = filas.find((r) => r.fecha === '2026-06-12')
  a(!manual.matched && manual.horaIntento === '', 'sin intento queda manual')
  a(manual.turnoInicio === '07:50', 'turno presente igual en la fila manual')

  a(construirJornadas([{ Fecha: '11-06-2026', RUT: '1-9', 'Primer Apellido': 'PACHECO',
      Nombre: 'CARLOS ALBERTO PACHECO CISTERNA' }], [], [])[0].nombre
    === 'CARLOS ALBERTO PACHECO CISTERNA', 'no duplicar un apellido ya presente')
  a(construirJornadas([jornadas[0]], fallidas, [])[0].sinTurno, 'sin asignación es sinTurno')

  const marcas = [
    { rut: '26258345-7', i: 'entrada', fecha: '11/6/2026', hora: '7:50:0', turno: '07:50-17:00', key: '26258345|2026-06-11' },
    { rut: '26258345-7', i: 'salida', fecha: '11/6/2026', hora: '17:0:0', turno: '07:50-17:00', key: '26258345|2026-06-11' },
  ]
  const enriquecidas = aplicarIntentos(marcas, fallidas)
  a(!enriquecidas[0].matched && enriquecidas[0].hora === '7:50:0', 'entrada sin intento queda igual')
  a(enriquecidas[1].matched && enriquecidas[1].hora === '16:52:0', 'salida toma la hora real')
  a(aplicarIntentos(marcas, [])[1].hora === '17:0:0', 'sin intentos nada cambia')

  const varios = aplicarIntentos(marcas, [
    fallidas[0],
    { ...fallidas[0], 'Hora intento': '17:40:00' },
    { ...fallidas[0], 'Hora intento': '16:10:00' },
  ])
  a(varios[1].hora === '17:40:0', 'con varios intentos gana el mas tardío')

  const diag = validarIntentos([
    { RUT: '26.258.345-7', 'Fecha intento': '23-06-2026', 'Hora intento': '16:52:00' },
    { RUT: '', 'Fecha intento': '24-06-2026', 'Hora intento': '16:52:00' },
    { RUT: '26.258.345-7', 'Fecha intento': 'basura', 'Hora intento': '16:52:00' },
  ])
  a(diag.ok && diag.total === 3 && diag.validas === 1, 'una de tres filas utilizable')
  a(diag.fechasInvalidas === 1 && diag.rutsInvalidos === 1, 'cuenta fechas y ruts ilegibles')
  a(!validarIntentos([{ Nombre: 'ANA', 'Fecha intento': '6/23/26', 'Hora intento': '1:1:1' }]).ok,
    'sin columna RUT se rechaza')
  a(!validarIntentos([]).ok, 'archivo vacío se rechaza')

  const rep = normalizarReporte([
    { 'Rut Trabajador': '26.258.345-7', Nombre: 'ANA SOTO', 'Fecha Inasistencia': '11-06-2026' },
    { 'Rut Trabajador': '', Nombre: 'SIN RUT', 'Fecha Inasistencia': '11-06-2026' },
    { 'Rut Trabajador': '26.258.345-7', Nombre: 'ANA SOTO', 'Fecha Inasistencia': 'basura' },
  ])
  a(rep.diag.ok && rep.diag.rutCol === 'Rut Trabajador', 'detecta la columna de RUT')
  a(rep.diag.fechaCol === 'Fecha Inasistencia', 'detecta la columna de fecha')
  a(rep.diag.total === 3 && rep.diag.validas === 1, 'descarta filas sin RUT o sin fecha')
  a(rep.rows[0].DNI === '26.258.345-7' && rep.rows[0].dia === 11, 'inyecta DNI y ano/mes/dia')
  a(rangoDeReporte(rep.rows).desde === '2026-06-11', 'rango desde las filas normalizadas')

  const comoApi = normalizarReporte([{ DNI: '262583457', ano: 2026, mes: 6, dia: 11, motivo: '-' }])
  a(comoApi.diag.ok && comoApi.diag.fechaCol === '', 'acepta ano/mes/dia sin columna de fecha')

  const real = normalizarReporte([{
    'Código': '123', RUT: '26.258.345-7', 'Primer Apellido': 'SOTO', 'Segundo Apellido': 'DIAZ',
    Nombre: 'ANA', Especialidad: 'MAESTRO', 'Área': 'OBRA GRUESA', Contrato: 'INDEFINIDO',
    'Turno ': '07:50-17:00', Supervisor: 'J PEREZ', 'Día': '11-06-2026', Motivo: '-',
    'Observación': '', Permiso: '',
  }])
  a(real.diag.rutCol === 'RUT' && real.diag.fechaCol === 'Día', 'reporte real detecta RUT y Día')
  a(real.rows[0]['Turno'] === '07:50-17:00', 'limpia espacios sobrantes en las cabeceras')
  const vis = columnasVisibles(real.columns)
  a(vis.join(',') === 'RUT,Primer Apellido,Segundo Apellido,Nombre,Área,Turno,Día,Motivo,Observación', vis.join(','))
  a(!vis.includes('Código') && !vis.includes('Supervisor'), 'oculta las columnas de relleno')
  a(columnasVisibles(['a', 'b']).length === 2, 'sin coincidencias muestra todas')

  a(!normalizarReporte([{ Nombre: 'X', Fecha: '11-06-2026' }]).diag.ok, 'sin RUT se rechaza')
  a(!normalizarReporte([]).diag.ok, 'vacío se rechaza')

  // El motivo sale de si hubo intento de marcaje, no de un valor fijo.
  a(motivoPorDefecto({ matched: true }) === MOTIVO_CORRECCION, 'con intento → corrección')
  a(motivoPorDefecto({ matched: false }) === MOTIVO_OLVIDO, 'sin intento → olvido')
  a(motivoPorDefecto({}) === MOTIVO_OLVIDO, 'sin el campo → olvido')
  a(aplicarIntentos(marcas, fallidas).map(motivoPorDefecto)
    .join() === `${MOTIVO_OLVIDO},${MOTIVO_CORRECCION}`, 'el motivo sigue al cruce real')

  a(normalizarFecha('23-06-2026') === '2026-06-23', 'fecha dd-mm-yyyy')
  a(normalizarFecha('3/6/2026') === '2026-06-03', 'fecha d/M/yyyy')
  a(normalizarFecha('2026-06-23') === '2026-06-23', 'fecha ya ISO')
  a(normalizarHora('7:52') === '7:52:00', 'hora sin segundos')
  a(normalizarSentido('E') === 'entrada' && normalizarSentido(' Salida ') === 'salida', 'sentido')
  a(normalizarSentido('x') === null, 'sentido ilegible')

  const planilla = leerIngresoManual([
    { RUT: '26.258.345-7', Fecha: '23-06-2026', Hora: '07:52', Sentido: 'entrada' },
    { RUT: '26.258.345-7', Fecha: '23-06-2026', Hora: '16:52:00', Sentido: 'x' },
    { RUT: '', Fecha: '', Hora: '', Sentido: '' },
  ])
  a(planilla.records.length === 1, 'una fila válida')
  a(planilla.records[0].hora === '07:52:00' && planilla.records[0].fecha === '2026-06-23', 'normaliza')
  a(planilla.errors.length === 1 && planilla.errors[0].includes('Fila 3'), planilla.errors.join())
  a(leerIngresoManual([{ Nombre: 'X' }]).errors[0].includes('Faltan columnas'), 'cabeceras faltantes')

  console.log('ok')
}
