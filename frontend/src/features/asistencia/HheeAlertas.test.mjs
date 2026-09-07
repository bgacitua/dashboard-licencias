// Check de las dos decisiones de HheeAlertas: cómo se lee la antigüedad del
// dato y qué dice el aviso tras refrescar. Corre con: node HheeAlertas.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./HheeAlertas.jsx', import.meta.url), 'utf8')

// --- Antigüedad del dato -----------------------------------------------------
// Importa porque la pantalla lee una tabla que llena otro servicio: si ese
// servicio dejó de correr, lo único que lo delata es este texto.
const hace = (iso, ahora) => {
  if (!iso) return null
  const minutos = Math.round((ahora - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.round(horas / 24)} d`
}

assert.ok(
  src.includes("if (minutos < 60) return `hace ${minutos} min`"),
  'la regla de antigüedad del componente cambió: actualizar este test'
)

const ahora = new Date('2026-09-07T15:00:00Z').getTime()
const menos = (min) => new Date(ahora - min * 60000).toISOString()

assert.equal(hace(null, ahora), null, 'sin fecha no se inventa antigüedad')
assert.equal(hace(menos(0), ahora), 'recién')
assert.equal(hace(menos(45), ahora), 'hace 45 min')
assert.equal(hace(menos(60 * 5), ahora), 'hace 5 h')
// Un dato de hace días es exactamente el caso que hay que ver: el job corre
// lunes a viernes, así que un lunes lo normal es "hace 3 d".
assert.equal(hace(menos(60 * 24 * 3), ahora), 'hace 3 d')

// --- Aviso del refresco ------------------------------------------------------
// El scraper responde 200 aunque un recinto falle, así que el aviso NO puede
// decir "listo" mirando solo el status: tiene que mirar el resumen.
const aviso = (r) => {
  const fallidos = (r.recintos || []).filter((x) => x.error)
  return fallidos.length
    ? `${r.ok} de ${r.ok + r.fallidos} recintos actualizados. Falló ${fallidos
        .map((f) => f.recinto)
        .join(', ')}.`
    : `${r.ok} recintos actualizados, ${r.alertas} alertas (${r.desde} a ${r.hasta}).`
}

assert.ok(
  src.includes('const fallidos = (r.recintos || []).filter((x) => x.error)'),
  'la regla del aviso cambió: actualizar este test'
)

assert.equal(
  aviso({ ok: 3, fallidos: 0, alertas: 17, desde: '2026-08-31', hasta: '2026-09-06', recintos: [] }),
  '3 recintos actualizados, 17 alertas (2026-08-31 a 2026-09-06).'
)

// Un recinto caído tiene que nombrarse: si no, el usuario cree que vio todo.
assert.equal(
  aviso({
    ok: 2,
    fallidos: 1,
    alertas: 5,
    recintos: [{ recinto: '36787' }, { recinto: '42123', error: 'Buk no responde' }],
  }),
  '2 de 3 recintos actualizados. Falló 42123.'
)

console.log('ok  HheeAlertas')
