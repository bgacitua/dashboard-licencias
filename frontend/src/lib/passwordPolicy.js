/**
 * Política de contraseñas del front. Espeja validate_password_strength de
 * app/schemas/auth.py: 12+ caracteres con minúscula, mayúscula y número.
 *
 * Vive acá y no en cada pantalla porque antes estaban duplicadas y divergieron:
 * el `pattern` del admin llevaba '\d' en un string JS, que se colapsa a 'd' y
 * terminaba exigiendo esa letra literal. Una sola fuente y un self-check.
 */

export const PASSWORD_MIN_LENGTH = 12

// Para el atributo `pattern` de <input> (string, no regex: ojo con el escape).
export const PASSWORD_PATTERN = `(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{${PASSWORD_MIN_LENGTH},}`

export const PASSWORD_HINT =
  `Al menos ${PASSWORD_MIN_LENGTH} caracteres, una minúscula, una mayúscula y un número.`

/** Misma regla que el pattern, para validar en JS. */
export function esPasswordValida(password) {
  // `pattern` se ancla solo; acá hay que anclarlo a mano.
  return new RegExp(`^(?:${PASSWORD_PATTERN})$`).test(password ?? '')
}

// `globalThis.process?.` y el assert inline, no 'node:assert': este módulo lo
// importa la app, así que todo lo de acá termina en el bundle. Un import de
// node: se vuelve top-level await y rompe el build.
if (globalThis.process?.argv?.[1]?.endsWith('passwordPolicy.js')) {
  const a = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg) }

  // El bug original: una contraseña válida sin la letra "d" era rechazada.
  a(esPasswordValida('ContrasenaLarga1'), 'válida sin la letra d')
  a(esPasswordValida('Dosdosdosdos1'), 'válida con d')

  a(!esPasswordValida('Corta1aaaaa'), 'menos de 12')
  a(!esPasswordValida('contrasenalarga1'), 'sin mayúscula')
  a(!esPasswordValida('CONTRASENALARGA1'), 'sin minúscula')
  a(!esPasswordValida('ContrasenaLarga'), 'sin número')
  a(!esPasswordValida(''), 'vacía')
  a(!esPasswordValida(null), 'null')

  console.log('passwordPolicy ok')
}
