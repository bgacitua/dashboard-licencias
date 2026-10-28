import React, { useEffect, useRef, useState } from 'react'
import { postMatch } from '../services/compensaciones'

const PARALELO = 4

// Prepara el match de los cargos sin homologar y los deja en una cola para revisarlos con el flujo normal.
// `preparados` ({ cargo_empresa_id: respuesta de /match }) vive en la página, en memoria.
export default function ColaMasiva({ estudio, cargos, preparados, onListo, onRevisar }) {
  const [progreso, setProgreso] = useState(null) // { hechos, total, fallos }
  const activo = useRef(true)
  useEffect(() => {
    activo.current = true // StrictMode monta, desmonta y vuelve a montar
    return () => { activo.current = false }
  }, [])

  const pendientes = cargos.filter((c) => !c.analisis_id)
  const listos = pendientes.filter((c) => preparados[c.id])
  const corriendo = progreso && progreso.hechos < progreso.total

  const preparar = async () => {
    const porPreparar = pendientes.filter((c) => !preparados[c.id])
    const p = { hechos: 0, total: porPreparar.length, fallos: 0 }
    let i = 0
    setProgreso({ ...p })
    const worker = async () => {
      while (activo.current && i < porPreparar.length) {
        const c = porPreparar[i++]
        try {
          onListo(c.id, await postMatch({
            estudio_id: estudio.id, cargo_nombre: c.name, descriptor: c.descriptor,
          }))
        } catch {
          p.fallos++
        }
        p.hechos++
        if (activo.current) setProgreso({ ...p })
      }
    }
    await Promise.all(Array.from({ length: PARALELO }, worker))
  }

  if (pendientes.length === 0) return null // sin cargos por homologar no hay nada que mostrar

  return (
    <div className="space-y-3 rounded-xl border border-app-line bg-white p-4 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-app-ink">
          Homologación masiva: {pendientes.length} sin homologar · {listos.length} listos para revisar
        </span>
        <button type="button" onClick={preparar} disabled={corriendo || pendientes.length === listos.length}
          className="ml-auto inline-flex h-9 items-center rounded-lg bg-app-brand px-4 text-[13px] font-semibold text-white hover:bg-app-brand/90 disabled:opacity-50">
          {corriendo ? 'Preparando…' : 'Preparar'}
        </button>
      </div>
      {progreso && (
        <div>
          <progress className="w-full" value={progreso.hechos} max={progreso.total} />
          <p className="text-xs text-app-muted">
            {progreso.hechos} de {progreso.total}{progreso.fallos > 0 && ` · ${progreso.fallos} con error (vuelve a Preparar)`}
          </p>
        </div>
      )}
      {listos.length > 0 && (
        <div className="max-h-64 divide-y divide-app-line overflow-y-auto rounded-lg border border-app-line">
          {listos.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-1.5">
              <span className="flex-1 text-app-ink">{c.name}</span>
              <button type="button" onClick={() => onRevisar(c)}
                className="rounded-lg border border-app-line px-3 py-1 text-xs font-medium text-app-ink hover:border-app-ink">
                Revisar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
