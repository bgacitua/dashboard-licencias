/**
 * Lectura y escritura de planillas para el reporte de bono.
 *
 * `xlsx` ya viene con la plataforma, así que el archivo de atrasos se parsea
 * acá (xls/xlsx/csv/html) y el .xlsx de salida también se arma acá: el backend
 * devuelve las hojas como JSON y no necesita una librería propia.
 */
import * as XLSX from 'xlsx'

// Columnas que debe traer el archivo de atrasos para que el cruce funcione.
export const COLUMNAS_ATRASOS = ['RUT', 'Especialidad', 'Día', 'Atraso con Holgura']

/** Archivo subido -> filas. raw:false deja fechas y horas como texto. */
export async function leerAtrasos(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(hoja, { raw: false, defval: '' })
}

/** Template con las cabeceras exactas, para no adivinar los nombres de columna. */
export function descargarTemplateAtrasos() {
  const ejemplo = [
    { RUT: '12.345.678-9', Especialidad: 'Carpintero', 'Día': '2026-06-20', 'Atraso con Holgura': '0:05:00' },
    { RUT: '9.999.999-9', Especialidad: 'Jornal', 'Día': '2026-07-01', 'Atraso con Holgura': '0:00:00' },
  ]
  const ws = XLSX.utils.json_to_sheet(ejemplo, { header: COLUMNAS_ATRASOS })
  // La columna "Día" (C) se fuerza a texto: si no, Excel la reinterpreta como
  // fecha en formato US al reabrir el archivo.
  for (let i = 2; i <= ejemplo.length + 1; i++) {
    if (ws[`C${i}`]) ws[`C${i}`].t = 's'
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Atrasos')
  XLSX.writeFile(wb, 'template-atrasos.xlsx')
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
