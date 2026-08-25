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

// Check: `node frontend/src/features/asistencia/marcas.js`
// Solo formatos de Buk (DNI con DV). Morpho normaliza distinto porque su
// EMPLOYEEID viene sin DV — ver limpiar_employeeid en morpho.py.
if (globalThis.process?.argv?.[1]?.endsWith('marcas.js')) {
  const eq = (a, b) => { if (a !== b) throw new Error(`${a} != ${b}`) }
  eq(limpiarRut('01234567-8'), '1234567')
  eq(limpiarRut('19.117.548-9'), '19117548')
  eq(limpiarRut('20573842-K'), '20573842')
  eq(claveMorpho({ DNI: '19117548-9', ano: 2026, mes: 8, dia: 5 }), '19117548|2026-08-05')
  console.log('ok')
}
