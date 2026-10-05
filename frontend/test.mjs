/**
 * Corre todos los self-checks del front: `npm test`.
 *
 * El repo no usa vitest ni jest; cada módulo lleva sus asserts al final,
 * detrás de un guard `process.argv[1]`, y se ejecuta con `node archivo.js`.
 * Esto los junta en un solo comando para que no haya que recordar cuáles son.
 *
 * Un archivo entra si se llama *.test.js/.mjs o *.selfcheck.mjs, o si trae el
 * guard adentro (así un módulo con su check inline, como exportar.js, no se
 * queda fuera por el nombre).
 */
import { execFileSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'

const GUARD = 'argv?.[1]?.endsWith'
const PORNOMBRE = /\.(test|selfcheck)\.m?js$/

const archivos = globSync('src/**/*.{js,jsx,mjs}')
  .filter((f) => PORNOMBRE.test(f) || readFileSync(f, 'utf8').includes(GUARD))
  .sort()

let fallados = 0
for (const f of archivos) {
  try {
    execFileSync(process.execPath, [f], { stdio: 'pipe' })
    console.log(`ok   ${f}`)
  } catch (e) {
    fallados++
    console.error(`FALLA ${f}\n${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? e.message}`)
  }
}

console.log(`\n${archivos.length - fallados}/${archivos.length} self-checks ok`)
// Sin archivos es una falla: significa que el glob se rompió, no que todo pase.
process.exit(fallados || archivos.length === 0 ? 1 : 0)
