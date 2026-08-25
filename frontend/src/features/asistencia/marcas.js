/**
 * Clave de cruce entre Inasistencias (Buk) y el reloj Morpho.
 *
 * Réplica exacta de `morpho.limpiar_employeeid` / `morpho.clave` del backend:
 * si las dos normalizaciones divergen, el cruce falla en silencio y todas las
 * filas quedan como "Sin marca".
 */

/** RUT -> cuerpo sin puntos, sin DV y sin ceros a la izquierda. */
export function limpiarRut(valor) {
  const v = String(valor ?? '').trim().replace(/\./g, '')
  // El DNI de Buk siempre trae DV: con guion es split[0]; sin guion, el último dígito.
  const cuerpo = v.includes('-') ? v.split('-')[0] : v.length > 1 ? v.slice(0, -1) : v
  return cuerpo.replace(/^0+/, '')
}

const pad = (n, len) => String(n ?? '').padStart(len, '0')

/** yyyy-mm-dd desde los campos ano/mes/dia de una fila de Inasistencias. */
export function fechaIso(fila) {
  return `${pad(fila.ano, 4)}-${pad(fila.mes, 2)}-${pad(fila.dia, 2)}`
}

/** Clave `rut|yyyy-mm-dd`, igual a la que devuelve /morpho-marcas. */
export function claveMorpho(fila) {
  return `${limpiarRut(fila.DNI ?? fila.dni ?? '')}|${fechaIso(fila)}`
}

// === Armado de marcas a ingresar ===
// Una inasistencia se corrige registrando las marcas que faltan. La hora sale
// del turno asignado (getAsignacionTurnos) y qué marca falta lo dice Marcajes.

const MOV = 'sistema automático'

/** "07:50-17:00" -> ["07:50","17:00"]; null si viene vacío o no calza. */
export function parseTurno(valor) {
  if (typeof valor !== 'string') return null
  const t = valor.trim()
  if (t === '' || t === '-') return null
  const partes = t.split('-')
  if (partes.length !== 2) return null
  const ok = (s) => /^\d{1,2}:\d{2}/.test(s.trim())
  return ok(partes[0]) && ok(partes[1]) ? [partes[0].trim(), partes[1].trim()] : null
}

/** Turno nocturno = termina a la misma hora o antes de empezar (cruza medianoche). */
export function esNocturno([ini, fin]) {
  const min = (s) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(s.trim())
    return Number(m[1]) * 60 + Number(m[2])
  }
  return min(fin) <= min(ini)
}

/** Una marca falta si la celda viene vacía o con guion. */
export function falta(valor) {
  if (typeof valor !== 'string') return valor == null
  const v = valor.trim()
  return v === '' || v === '-'
}

/** Fecha en cualquiera de los formatos que devuelven las APIs -> yyyy-mm-dd. */
export function aIso(valor) {
  const s = String(valor ?? '').trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})-(\d{1,2})-(\d{4})/.exec(s) // dd-mm-yyyy (getAsignacionTurnos)
  if (m) return `${m[3]}-${pad(m[2], 2)}-${pad(m[1], 2)}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s) // d/M/yyyy
  if (m) return `${m[3]}-${pad(m[2], 2)}-${pad(m[1], 2)}`
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${pad(m[2], 2)}-${pad(m[3], 2)}`
  return null
}

export const claveMarcaje = (r) => {
  const fecha = aIso(r.dia_entrada) ?? aIso(r.entrada_format ?? r.salida_format)
  return fecha ? `${limpiarRut(r.rut_trabajador ?? '')}|${fecha}` : null
}

export const claveAsignacion = (r) => {
  const fecha = aIso(r.diaTurno)
  return fecha ? `${limpiarRut(r.dni ?? '')}|${fecha}` : null
}

/** Indexa filas por su clave rut|fecha; la primera gana. */
export function indexar(rows, clave) {
  const m = new Map()
  for (const r of rows) {
    const k = clave(r)
    if (k && !m.has(k)) m.set(k, r)
  }
  return m
}

/** d/M/yyyy (sin ceros) desde ano/mes/dia, +offset días. Formato que pide Buk. */
function fechaApi(fila, offsetDias = 0) {
  const d = new Date(Number(fila.ano), Number(fila.mes) - 1, Number(fila.dia) + offsetDias)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

/** "07:50" -> "7:50:0" (H:m:s, sin ceros a la izquierda). */
const horaApi = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim())
  return m ? `${Number(m[1])}:${Number(m[2])}:0` : ''
}

/**
 * Clasifica una inasistencia según si genera marcas:
 *   sin-turno / turno-invalido -> no hay horario del cual sacar la hora
 *   ambas-existen              -> Marcajes ya tiene entrada y salida
 *   ingresar                   -> falta entrada, salida, o las dos
 */
export function estadoIngreso(fila, turnos, marcajes) {
  const k = claveMorpho(fila)
  const asignacion = turnos.get(k)
  if (!asignacion) return { tipo: 'sin-turno' }
  if (!parseTurno(asignacion.horarioTurno)) return { tipo: 'turno-invalido' }
  const marcaje = marcajes.get(k)
  const entrada = marcaje ? falta(marcaje.entrada_format) : true
  const salida = marcaje ? falta(marcaje.salida_format) : true
  if (!entrada && !salida) return { tipo: 'ambas-existen' }
  return { tipo: 'ingresar', entrada, salida }
}

/** Marcas a registrar para las inasistencias dadas. */
export function construirMarcas(inasistencias, asignaciones, marcajes) {
  const turnos = indexar(asignaciones, claveAsignacion)
  const previas = indexar(marcajes, claveMarcaje)
  const out = []
  for (const fila of inasistencias) {
    const estado = estadoIngreso(fila, turnos, previas)
    if (estado.tipo !== 'ingresar') continue
    const asignacion = turnos.get(claveMorpho(fila))
    const turno = parseTurno(asignacion.horarioTurno)
    const base = {
      rut: String(fila.DNI ?? fila.dni ?? '').trim(),
      nombre: String(asignacion.nombreTrabajador ?? ''),
      turno: String(asignacion.horarioTurno),
      fecha: fechaApi(fila),
      mov: MOV,
      key: claveMorpho(fila),
    }
    if (estado.entrada) out.push({ ...base, i: 'entrada', hora: horaApi(turno[0]) })
    if (estado.salida) {
      // Turno nocturno: la salida cae el día siguiente al del turno.
      const fecha = esNocturno(turno) ? fechaApi(fila, 1) : base.fecha
      out.push({ ...base, i: 'salida', fecha, hora: horaApi(turno[1]) })
    }
  }
  return out
}

/** Payload del POST: sin los campos que solo sirven para mostrar. */
export const aPayload = (m) => ({ rut: m.rut, i: m.i, fecha: m.fecha, hora: m.hora, mov: m.mov })

// Check: `node frontend/src/features/asistencia/marcas.js`
// Solo formatos de Buk (DNI con DV). Morpho normaliza distinto porque su
// EMPLOYEEID viene sin DV — ver limpiar_employeeid en morpho.py.
if (globalThis.process?.argv?.[1]?.endsWith('marcas.js')) {
  const eq = (a, b) => { if (a !== b) throw new Error(`${a} != ${b}`) }
  eq(limpiarRut('01234567-8'), '1234567')
  eq(limpiarRut('19.117.548-9'), '19117548')
  eq(limpiarRut('20573842-K'), '20573842')
  eq(claveMorpho({ DNI: '19117548-9', ano: 2026, mes: 8, dia: 5 }), '19117548|2026-08-05')

  // Turno diurno: entrada y salida el mismo día.
  const ina = { DNI: '19117548-9', ano: 2026, mes: 8, dia: 5 }
  const turno = { dni: '19117548-9', diaTurno: '05-08-2026', horarioTurno: '07:50-17:00',
                  nombreTrabajador: 'Ana' }
  let marcas = construirMarcas([ina], [turno], [])
  eq(marcas.length, 2)
  eq(marcas[0].hora, '7:50:0')
  eq(marcas[0].fecha, '5/8/2026')
  eq(marcas[1].fecha, '5/8/2026')

  // Turno nocturno: la salida cae al día siguiente.
  marcas = construirMarcas([ina], [{ ...turno, horarioTurno: '20:00-06:00' }], [])
  eq(marcas[1].i, 'salida')
  eq(marcas[1].fecha, '6/8/2026')

  // Marcaje con la entrada ya puesta: solo se genera la salida.
  const marcaje = { rut_trabajador: '19117548-9', dia_entrada: '5/8/2026',
                    entrada_format: '07:55', salida_format: '-' }
  marcas = construirMarcas([ina], [turno], [marcaje])
  eq(marcas.length, 1)
  eq(marcas[0].i, 'salida')

  // Ambas marcas presentes o sin turno asignado: nada que registrar.
  eq(construirMarcas([ina], [turno], [{ ...marcaje, salida_format: '17:02' }]).length, 0)
  eq(construirMarcas([ina], [], []).length, 0)
  eq(construirMarcas([ina], [{ ...turno, horarioTurno: '-' }], []).length, 0)

  eq(JSON.stringify(aPayload(marcas[0])),
     JSON.stringify({ rut: '19117548-9', i: 'salida', fecha: '5/8/2026', hora: '17:0:0',
                      mov: 'sistema automático' }))

  console.log('ok')
}

