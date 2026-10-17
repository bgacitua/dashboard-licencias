import React, { useState } from 'react'
import { postMatch } from '../services/compensaciones'

const input = 'w-full rounded-lg border border-app-line px-3 py-2 text-[13px] text-app-ink placeholder:text-app-outline focus:outline-none focus:border-app-ink focus:ring-1 focus:ring-app-ink'
const boton = 'inline-flex h-9 items-center rounded-lg bg-app-brand px-4 text-[13px] font-semibold text-white hover:bg-app-brand/90 disabled:opacity-50'

export default function PasoMatch({ estudio, onContinuar }) {
  const [nombre, setNombre] = useState('')
  const [descriptor, setDescriptor] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [match, setMatch] = useState(null)
  const [elegidos, setElegidos] = useState([])

  const buscar = async (e) => {
    e.preventDefault()
    setCargando(true)
    setError('')
    try {
      setMatch(await postMatch({ estudio_id: estudio.id, cargo_nombre: nombre, descriptor: descriptor || null }))
      setElegidos([])
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo buscar en el mercado.')
    } finally {
      setCargando(false)
    }
  }

  const alternar = (codigo) =>
    setElegidos((a) => (a.includes(codigo) ? a.filter((c) => c !== codigo) : [...a, codigo]))

  return (
    <div className="space-y-4">
      <form onSubmit={buscar} className="space-y-3 rounded-xl border border-app-line bg-white p-4">
        <input className={input} placeholder="Título del cargo" maxLength={200} required
          value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <textarea className={input} rows={3} maxLength={4000} placeholder="Descriptor (opcional)"
          value={descriptor} onChange={(e) => setDescriptor(e.target.value)} />
        <button type="submit" className={boton} disabled={cargando || !nombre.trim()}>
          {cargando ? 'Buscando…' : 'Buscar en mercado'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {match?.fuente === 'coseno' && (
        <p className="rounded-lg bg-yellow-100 px-3 py-2 text-sm text-yellow-700">
          Scores por similitud: el scoring con IA no respondió
        </p>
      )}
      {match && match.candidatos.length === 0 && (
        <p className="text-sm text-app-muted">No se encontraron cargos de mercado parecidos.</p>
      )}

      {match?.candidatos.map((c) => (
        <label key={c.cargo_codigo} className="flex cursor-pointer gap-3 rounded-xl border border-app-line bg-white p-4">
          <input type="checkbox" className="mt-1" checked={elegidos.includes(c.cargo_codigo)}
            onChange={() => alternar(c.cargo_codigo)} />
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-app-ink">
                {c.titulo} <span className="font-normal text-app-muted">{c.cargo_codigo}</span>
              </span>
              <span className="font-semibold text-app-brand">{Math.round(c.score)}</span>
            </div>
            <p className="text-xs text-app-muted">{c.familia} › {c.subfamilia}</p>
            {c.justificacion && <p className="mt-1 text-app-ink">{c.justificacion}</p>}
            {c.titulo_tipico && <p className="mt-1 text-xs text-app-muted">Título típico: {c.titulo_tipico}</p>}
            {c.descripcion && (
              <details className="mt-1 text-xs text-app-muted" onClick={(e) => e.stopPropagation()}>
                <summary className="cursor-pointer">Descripción</summary>
                {c.descripcion}
              </details>
            )}
          </div>
        </label>
      ))}

      {match?.candidatos.length > 0 && (
        <button type="button" className={boton} disabled={elegidos.length === 0}
          onClick={() => onContinuar(match.analisis_id, elegidos)}>
          Continuar
        </button>
      )}
    </div>
  )
}
