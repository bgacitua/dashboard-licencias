import React, { useEffect, useState } from 'react'
import { deleteAnalisis, getHistorial } from '../services/compensaciones'

const fecha = (iso) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })

export default function Historial({ estudio, onAbrir }) {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getHistorial(estudio.id).then(setLista).catch(() => setError('No se pudo cargar el historial.'))
  }, [estudio.id])

  const borrar = (e, a) => {
    e.stopPropagation()
    if (!window.confirm(`¿Borrar el análisis "${a.cargo_nombre}"?`)) return
    deleteAnalisis(a.id)
      .then(() => setLista((l) => l.filter((x) => x.id !== a.id)))
      .catch(() => setError('No se pudo borrar el análisis.'))
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!lista) return <p className="text-sm text-app-muted">Cargando…</p>
  if (lista.length === 0) return <p className="text-sm text-app-muted">Aún no hay análisis guardados en {estudio.vista}.</p>

  return (
    <div className="overflow-x-auto rounded-xl border border-app-line bg-white">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-app-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Fecha</th>
            <th className="px-4 py-2 font-medium">Cargo</th>
            <th className="px-4 py-2 font-medium">Cargos de mercado</th>
            <th className="px-4 py-2 font-medium">Nivel</th>
            <th className="px-4 py-2 font-medium">Creado por</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-app-line">
          {lista.map((a) => (
            <tr key={a.id} onClick={() => onAbrir(a)} className="cursor-pointer hover:bg-app-surface">
              <td className="whitespace-nowrap px-4 py-2 text-app-muted">{fecha(a.created_at)}</td>
              <td className="px-4 py-2 font-semibold text-app-ink">{a.cargo_nombre}</td>
              <td className="px-4 py-2 text-app-muted">{a.cargos.join(', ')}</td>
              <td className="whitespace-nowrap px-4 py-2">{a.nivel} <span className="text-app-muted">{a.nivel_nombre}</span></td>
              <td className="px-4 py-2 text-app-muted">{a.creado_por}</td>
              <td className="px-2 py-2 text-right">
                <button type="button" title="Borrar" onClick={(e) => borrar(e, a)}
                  className="rounded p-1 text-app-muted hover:bg-red-50 hover:text-red-600">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
