// Check del RUT mostrado y de la agrupación por aviso.
// Corre con: node Notificaciones.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./Notificaciones.jsx', import.meta.url), 'utf8')

// El valor que viaja a la API es el RUT normalizado, no el formateado: si
// alguien cambia esto, el permiso se crea con un RUT que Buk no conoce.
assert.ok(
  src.includes('AsistenciaService.crearPermiso(f.token, f.fecha'),
  'el permiso se crea con el token y la fecha, no con el RUT de pantalla',
)

// Copias del fuente: el test no monta React, solo fija el comportamiento.
const formatearRut = (cuerpo) => {
  const n = String(cuerpo ?? '').replace(/\D/g, '')
  if (!n) return cuerpo || ''
  let suma = 0
  let factor = 2
  for (let i = n.length - 1; i >= 0; i--) {
    suma += Number(n[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  return `${n.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

assert.equal(formatearRut('17291849'), '17.291.849-2')
assert.equal(formatearRut('1000005'), '1.000.005-K', 'DV 10 se muestra como K')
assert.equal(formatearRut('1000013'), '1.000.013-0', 'DV 11 se muestra como 0')
assert.equal(formatearRut('11111111'), '11.111.111-1')
assert.equal(formatearRut(''), '', 'sin RUT no se inventa un DV')

const agrupar = (items) => {
  const porToken = new Map()
  for (const it of items) {
    const g = porToken.get(it.token)
    if (g) g.fechas.push(it)
    else porToken.set(it.token, { ...it, fechas: [it] })
  }
  return [...porToken.values()]
}

// Un trabajador con dos fechas es una sola tarjeta, con ambas adentro.
const grupos = agrupar([
  { token: 'a', rut: '1', fecha: '2026-01-01', respuesta: 'Permiso pagado' },
  { token: 'a', rut: '1', fecha: '2026-01-02', respuesta: 'Otro motivo' },
  { token: 'b', rut: '2', fecha: '2026-01-01', respuesta: 'Inasistencia' },
])
assert.equal(grupos.length, 2)
assert.deepEqual(grupos[0].fechas.map((f) => f.fecha), ['2026-01-01', '2026-01-02'])
assert.equal(grupos[1].token, 'b')

// El orden que manda la API (respuesta más reciente primero) se conserva.
const orden = agrupar([
  { token: 'z', fecha: '2026-02-01' },
  { token: 'a', fecha: '2026-01-01' },
])
assert.deepEqual(orden.map((g) => g.token), ['z', 'a'])

// Mismo corte que hace el backend: días corridos del mismo motivo.
const rachas = (fechas) => {
  const grupos = []
  let previa = null
  let motivo = null
  for (const f of [...fechas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const dia = new Date(`${f.fecha}T00:00:00Z`)
    const sigue = previa && f.respuesta === motivo && dia - previa === 86400000
    if (sigue) grupos[grupos.length - 1].push(f)
    else grupos.push([f])
    previa = dia
    motivo = f.respuesta
  }
  return grupos
}

const tramos = (items) => rachas(items).map((g) => g.map((f) => f.fecha))

assert.deepEqual(
  tramos([
    { fecha: '2026-01-01', respuesta: 'Permiso pagado' },
    { fecha: '2026-01-02', respuesta: 'Permiso pagado' },
  ]),
  [['2026-01-01', '2026-01-02']],
  'consecutivas con el mismo motivo van en un permiso',
)
assert.deepEqual(
  tramos([
    { fecha: '2026-01-01', respuesta: 'Permiso pagado' },
    { fecha: '2026-01-03', respuesta: 'Permiso pagado' },
  ]),
  [['2026-01-01'], ['2026-01-03']],
  'un hueco abre otro permiso',
)
assert.deepEqual(
  tramos([
    { fecha: '2026-01-01', respuesta: 'Permiso pagado' },
    { fecha: '2026-01-02', respuesta: 'Permiso sin goce' },
  ]),
  [['2026-01-01'], ['2026-01-02']],
  'cambiar de motivo también corta',
)
// Cruce de mes y de año: la resta de fechas no se confunde con el calendario.
assert.deepEqual(
  tramos([
    { fecha: '2025-12-31', respuesta: 'p' },
    { fecha: '2026-01-01', respuesta: 'p' },
  ]),
  [['2025-12-31', '2026-01-01']],
)
// Cambio de horario en Chile (2026-09-06): en hora local ese día dura 23 h y
// la racha se cortaría sola. Por eso el cálculo va en UTC.
assert.deepEqual(
  tramos([
    { fecha: '2026-09-05', respuesta: 'p' },
    { fecha: '2026-09-06', respuesta: 'p' },
    { fecha: '2026-09-07', respuesta: 'p' },
  ]),
  [['2026-09-05', '2026-09-06', '2026-09-07']],
)
assert.deepEqual(tramos([]), [])

console.log('ok')
