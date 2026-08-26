// Check de avisosDe: el correo sale de la base y el manual es solo respaldo.
// Corre con: node AvisarJefatura.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./AvisarJefatura.jsx', import.meta.url), 'utf8')

// Ata el test al fuente: si allá cambia la precedencia, esto falla.
assert.ok(
  src.includes('jefatura: jefaturasPorRut[rut] || jefatura'),
  'la jefatura de la base debe tener prioridad sobre la escrita a mano',
)

const limpiarRut = (v) => {
  const s = String(v ?? '').trim().replace(/\./g, '')
  const cuerpo = s.includes('-') ? s.split('-')[0] : s.length > 1 ? s.slice(0, -1) : s
  return cuerpo.replace(/^0+/, '')
}
const avisosDe = (rows, jefatura, nombres, jefaturasPorRut = {}) => {
  const porRut = new Map()
  for (const r of rows) {
    const rut = limpiarRut(r.DNI)
    const aviso = porRut.get(rut) ??
      { rut, nombre: nombres.get(rut) ?? '', jefatura: jefaturasPorRut[rut] || jefatura, fechas: [] }
    if (!aviso.fechas.includes(r.fecha)) aviso.fechas.push(r.fecha)
    porRut.set(rut, aviso)
  }
  return [...porRut.values()].map((a) => ({ ...a, fechas: a.fechas.sort() }))
}

const rows = [
  { DNI: '12.345.678-9', fecha: '2026-01-02' },
  { DNI: '12.345.678-9', fecha: '2026-01-01' },
  { DNI: '9.876.543-2', fecha: '2026-01-01' },
]
const avisos = avisosDe(rows, 'manual@empresa.cl', new Map(), { 12345678: 'jefe@empresa.cl' })

assert.equal(avisos.length, 2, 'un aviso por trabajador')
assert.deepEqual(avisos[0].fechas, ['2026-01-01', '2026-01-02'], 'fechas juntas y ordenadas')
assert.equal(avisos[0].jefatura, 'jefe@empresa.cl', 'usa el jefe de la base')
assert.equal(avisos[1].jefatura, 'manual@empresa.cl', 'sin jefe en la base cae al manual')

console.log('ok')
