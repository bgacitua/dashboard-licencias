// Check de la lógica de ResultadoMarcas: qué tono y qué título sale de cada
// forma de resultado. Corre con: node ResultadoMarcas.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./ResultadoMarcas.jsx', import.meta.url), 'utf8')

// Reimplementación de las dos decisiones del componente. El assert de abajo
// ata este test al fuente: si allá cambia la regla, esto falla en vez de
// seguir validando una copia vieja.
const tonoDe = (r) => (r.dry_run ? 'prueba' : (r.fallidas ?? 0) > 0 ? 'parcial' : 'exito')
const cuenta = (n) => (n === 1 ? `${n} marca registrada` : `${n} marcas registradas`)
const tituloDe = (r) => {
  const enviadas = r.enviadas ?? 0
  const fallidas = r.fallidas ?? 0
  if (r.dry_run) return 'Modo de prueba: no se envió nada a Buk'
  return fallidas > 0 ? `${cuenta(enviadas)}, ${fallidas} con error` : `${cuenta(enviadas)} en Buk`
}

assert.ok(
  src.includes("resultado.dry_run ? 'prueba' : fallidas > 0 ? 'parcial' : 'exito'"),
  'la regla de tono del componente cambió: actualizar este test'
)

// Un registro parcial no puede leerse como éxito: era el bug original.
assert.equal(tonoDe({ enviadas: 8, fallidas: 2 }), 'parcial')
assert.equal(tonoDe({ enviadas: 10, fallidas: 0 }), 'exito')
assert.equal(tonoDe({ enviadas: 0, fallidas: 0, dry_run: true }), 'prueba')
// dry_run manda aunque haya fallidas: no se escribió nada en Buk.
assert.equal(tonoDe({ enviadas: 0, fallidas: 3, dry_run: true }), 'prueba')

// Concordancia de número.
assert.equal(tituloDe({ enviadas: 1, fallidas: 0 }), '1 marca registrada en Buk')
assert.equal(tituloDe({ enviadas: 3, fallidas: 0 }), '3 marcas registradas en Buk')
assert.equal(tituloDe({ enviadas: 8, fallidas: 2 }), '8 marcas registradas, 2 con error')
assert.equal(tituloDe({ enviadas: 1, fallidas: 2 }), '1 marca registrada, 2 con error')
// Campos ausentes no deben producir "undefined marcas".
assert.equal(tituloDe({}), '0 marcas registradas en Buk')

console.log('ok  ResultadoMarcas')
