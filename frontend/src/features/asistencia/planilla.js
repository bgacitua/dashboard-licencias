/**
 * Lectura y escritura de planillas para el reporte de bono.
 *
 * `xlsx` ya viene con la plataforma, así que el archivo de atrasos se parsea
 * acá (xls/xlsx/csv/html) y el .xlsx de salida también se arma acá: el backend
 * devuelve las hojas como JSON y no necesita una librería propia.
 */
import * as XLSX from 'xlsx'

// Columnas que debe traer el archivo de atrasos para que el cruce funcione.
// Es también la whitelist: del xls de Buk se descarta todo lo demás (apellidos,
// nombre, contrato, supervisor, tiempo de atraso) sin nombrarlo una por una.
export const COLUMNAS_ATRASOS = ['RUT', 'Especialidad', 'Día', 'Atraso con Holgura', 'Hora de Turno', 'Hora de Ingreso']

// Un xls por recinto: Buk no exporta los tres juntos.
export const RECINTOS = ['Cramer Lucerna', 'Aplicación', 'Admin y Lab']

/** Cabecera normalizada: ignora tildes, casing y separadores. */
const norm = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Filas crudas de Buk -> solo las columnas que usa el reporte.
 * Lanza si al archivo le falta alguna: mejor eso que atrasos silenciosamente en 0.
 */
export function limpiarAtrasos(filas) {
  if (!filas.length) return []
  const mapa = new Map(Object.keys(filas[0]).map((k) => [norm(k), k]))
  const falta = COLUMNAS_ATRASOS.filter((c) => !mapa.has(norm(c)))
  if (falta.length) throw new Error(`faltan columnas: ${falta.join(', ')}`)
  return filas.map((r) =>
    Object.fromEntries(COLUMNAS_ATRASOS.map((c) => [c, r[mapa.get(norm(c))] ?? ''])),
  )
}

/** Resumen sobre la tabla del reporte oficial. null si las filas no son de ese reporte. */
export function resumenBono(rows) {
  if (!rows?.length || !('Bono Total' in rows[0])) return null
  const bonos = (t) => rows.filter((r) => Number(r['Bono Total']) === t).length
  const suma = (campo) =>
    rows.reduce((a, r) => a + (Number(r[`${campo} Periodo 1`]) || 0) + (Number(r[`${campo} Periodo 2`]) || 0), 0)
  return {
    'Bonos 100%': bonos(1), 'Bonos 50%': bonos(0.5), 'Bonos 0%': bonos(0),
    Atrasos: suma('Atrasos'), 'Olvidos de Marca': suma('Olvido Marca'),
    Licencias: suma('Licencias'), Permisos: suma('Permisos'), Inasistencias: suma('Inasistencias'),
  }
}

/** Archivo subido -> filas. raw:false deja fechas y horas como texto. */
export async function leerAtrasos(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(hoja, { raw: false, defval: '' })
}

/** Hojas del backend ({nombre, rows, columns}) -> descarga de un .xlsx. */
export function descargarHojas(hojas, nombreArchivo) {
  const wb = XLSX.utils.book_new()
  for (const { nombre, rows, columns } of hojas) {
    // header fija el orden de columnas; sheet_to_json del backend ya trae las
    // filas con esas claves, pero una hoja vacía si no perdería las cabeceras.
    const ws = XLSX.utils.json_to_sheet(rows, { header: columns })
    XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31)) // límite de Excel
  }
  XLSX.writeFile(wb, nombreArchivo)
}

// ponytail: self-check con `node src/features/asistencia/planilla.js`.
if (globalThis.process?.argv?.[1]?.endsWith('planilla.js')) {
  const eq = (a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`)
  }
  // Descarta las columnas de Buk que no se usan y tolera tildes/casing en la cabecera.
  eq(limpiarAtrasos([{
    'Primer Apellido': 'Pérez', 'Segundo Apellido': 'Soto', Nombre: 'Ana', Contrato: 'Indefinido',
    Supervisor: 'Juan', 'Tiempo Atraso': '0:10:00',
    rut: '12.345.678-9', ESPECIALIDAD: 'Carpintero', Dia: '2026-06-20',
    'Hora de turno': '08:00', 'HORA DE INGRESO': '08:07', 'Atraso con Holgura': '0:07:00',
  }]), [{
    RUT: '12.345.678-9', Especialidad: 'Carpintero', 'Día': '2026-06-20',
    'Atraso con Holgura': '0:07:00', 'Hora de Turno': '08:00', 'Hora de Ingreso': '08:07',
  }])
  eq(limpiarAtrasos([]), [])
  try {
    limpiarAtrasos([{ RUT: '1-9' }])
    throw new Error('debió fallar por columnas faltantes')
  } catch (e) {
    if (!e.message.startsWith('faltan columnas')) throw e
  }

  const fila = (total, atr = 0) => ({
    'Bono Total': total, 'Atrasos Periodo 1': atr, 'Atrasos Periodo 2': atr,
    'Olvido Marca Periodo 1': 1, 'Licencias Periodo 2': 2,
  })
  eq(resumenBono([fila(1, 3), fila(0.5), fila(0)]), {
    'Bonos 100%': 1, 'Bonos 50%': 1, 'Bonos 0%': 1,
    Atrasos: 6, 'Olvidos de Marca': 3, Licencias: 6, Permisos: 0, Inasistencias: 0,
  })
  eq(resumenBono([]), null)
  eq(resumenBono([{ 'Proyección (piso)': 1 }]), null) // simulación: sin resumen
  console.log('planilla ok')
}
