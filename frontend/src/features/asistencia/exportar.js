/**
 * Descarga las filas de una vista como CSV.
 *
 * Se hace en el cliente porque la tabla ya tiene todas las filas cargadas: un
 * endpoint de export por vista repetiría la consulta a Buk para devolver lo
 * mismo. Además así viajan las columnas calculadas acá (p. ej. "¿Marca Morpho?").
 */
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

export function filasACsv(rows, columns) {
  const lineas = [columns.map(esc).join(',')]
  for (const r of rows) lineas.push(columns.map((c) => esc(r[c])).join(','))
  return lineas.join('\r\n')
}

export function descargarCsv(rows, columns, nombre) {
  // BOM para que Excel lo abra en UTF-8 y no rompa los acentos.
  const blob = new Blob(['﻿' + filasACsv(rows, columns)], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Check: `node frontend/src/features/asistencia/exportar.js`
if (globalThis.process?.argv?.[1]?.endsWith('exportar.js')) {
  const eq = (a, b) => { if (a !== b) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`) }
  eq(filasACsv([{ a: 1, b: 'x' }], ['a', 'b']), '"a","b"\r\n"1","x"')
  eq(filasACsv([{ a: 'di"jo' }], ['a']), '"a"\r\n"di""jo"')
  // Celda faltante y columna que la fila no trae: quedan vacías, no "undefined".
  eq(filasACsv([{ a: null }], ['a', 'z']), '"a","z"\r\n"",""')
  console.log('ok')
}
