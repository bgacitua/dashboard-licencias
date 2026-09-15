import React, { useRef, useState } from 'react'
import { COLUMNAS_ATRASOS, RECINTOS, leerAtrasos, limpiarAtrasos } from './planilla'

/**
 * Carga del reporte de atrasos: un xls por recinto, unificados acá.
 *
 * Buk exporta un archivo por recinto y con columnas de más. Antes el usuario
 * tenía que limpiarlos a mano y pegarlos en un template; ahora sube los tres
 * tal cual salen y `limpiarAtrasos` se queda con las columnas que usa el reporte.
 */
const Fila = ({ recinto, estado, onArchivo, onQuitar }) => {
  const ref = useRef(null)
  const listo = estado?.filas

  return (
    <li className="flex items-center gap-3 py-3 border-b border-app-line last:border-0">
      <span className="flex-1 text-sm text-app-ink">{recinto}</span>

      {estado?.cargando && (
        <span className="flex items-center gap-2 text-sm text-app-muted">
          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
          Leyendo…
        </span>
      )}

      {listo && (
        // animate-[fade] no existe en tailwind base; fade-in con opacity + transition.
        <span className="flex items-center gap-3 text-sm transition-opacity duration-300">
          <span className="flex items-center gap-1 text-emerald-700">
            <span className="material-symbols-outlined text-base">check_circle</span>
            {estado.filas.length} filas
          </span>
          <button onClick={() => onQuitar(recinto)}
                  className="text-app-muted hover:text-app-ink underline underline-offset-2">
            Deshacer
          </button>
        </span>
      )}

      {estado?.error && <span className="text-sm text-red-600">{estado.error}</span>}

      {!listo && !estado?.cargando && (
        <>
          <input ref={ref} type="file" accept=".xls,.xlsx,.csv" className="hidden"
                 onChange={(e) => onArchivo(recinto, e.target.files?.[0])} />
          <button onClick={() => ref.current?.click()}
                  className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface transition-colors">
            Cargar archivo
          </button>
        </>
      )}
    </li>
  )
}

const CargarAtrasos = ({ abierto, onCerrar, estados, setEstados }) => {
  const cargar = async (recinto, file) => {
    if (!file) return
    setEstados((e) => ({ ...e, [recinto]: { cargando: true } }))
    try {
      const filas = limpiarAtrasos(await leerAtrasos(file))
      if (!filas.length) throw new Error('el archivo no tiene filas')
      setEstados((e) => ({ ...e, [recinto]: { filas, nombre: file.name } }))
    } catch (err) {
      setEstados((e) => ({ ...e, [recinto]: { error: `No se pudo leer: ${err.message}` } }))
    }
  }

  const quitar = (recinto) => setEstados((e) => ({ ...e, [recinto]: undefined }))

  if (!abierto) return null
  const completos = RECINTOS.filter((r) => estados[r]?.filas).length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
         onClick={onCerrar}>
      <div className="bg-white rounded-xl w-full max-w-lg" role="dialog" aria-modal="true"
           aria-label="Cargar atrasos" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-app-line">
          <h2 className="text-lg font-semibold text-app-ink">Cargar atrasos</h2>
          <p className="text-sm text-app-muted mt-1">
            Un archivo por recinto, tal como sale de Buk. Las columnas de más se descartan solas;
            se usan <code>{COLUMNAS_ATRASOS.join(' · ')}</code>.
          </p>
        </div>

        <ul className="px-6">
          {RECINTOS.map((r) => (
            <Fila key={r} recinto={r} estado={estados[r]} onArchivo={cargar} onQuitar={quitar} />
          ))}
        </ul>

        <div className="px-6 py-4 border-t border-app-line flex items-center gap-3">
          <span className="flex-1 text-sm text-app-muted">
            {completos} de {RECINTOS.length} recintos cargados
          </span>
          <button onClick={onCerrar}
                  className="px-4 py-1.5 text-sm rounded bg-app-brand text-white">
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}

export default CargarAtrasos
