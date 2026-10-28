import React, { useEffect, useState } from 'react'
import { postResultado } from '../services/compensaciones'
import { LOCALE } from './PasoResultado'

const ESTADISTICAS = [['p25', 'P25'], ['mediana', 'Mediana'], ['promedio', 'Promedio'], ['p75', 'P75']]

// Cifras de la homologación vigente: COMP1 mensual (cargos / híbrido) y COMP3_REAL anual (subfamilia / promedio).
function Detalle({ c, estudio }) {
  const [r, setR] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!c.cargos) return
    postResultado({ estudio_id: estudio.id, cargos: c.cargos, nivel: c.nivel })
      .then(setR)
      .catch(() => setError('No se pudo cargar el mercado.'))
  }, [c.id])

  const fmt = new Intl.NumberFormat(LOCALE[estudio.pais], { style: 'currency', currency: estudio.moneda, maximumFractionDigits: 0 })
  const fila = (medida, tipos) => tipos.map((t) => r?.filas.find((f) => f.medida_codigo === medida && f.tipo === t)).find(Boolean)
  const bloques = r && [
    ['Sueldo mensual (COMP1)', fila('COMP1', ['hibrido', 'cargo']), r.factor_mensual],
    ['Compensación total anual (COMP3_REAL)', fila('COMP3_REAL', ['promedio_subfamilias', 'subfamilia']), 1],
  ]

  return (
    <div className="space-y-3 border-t border-app-line bg-app-surface px-4 py-3 text-sm">
      {c.requirements && <p className="whitespace-pre-line text-xs text-app-muted"><b>Requerimientos:</b> {c.requirements}</p>}
      {error && <p className="text-red-600">{error}</p>}
      {c.cargos && !r && !error && <p className="text-app-muted">Cargando…</p>}
      {bloques?.map(([titulo, f, div]) => (
        <div key={titulo}>
          <p className="font-semibold text-app-ink">{titulo} <span className="font-normal text-app-muted">{f?.titulo}</span></p>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ESTADISTICAS.map(([k, etiqueta]) => (
              <div key={k}><span className="text-xs text-app-muted">{etiqueta}</span><br />{f?.[k] == null ? 's/d' : fmt.format(f[k] / div)}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Fila({ c, estudio, esAdmin, onEditar }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div>
      <div onClick={() => setAbierto(!abierto)} className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-app-surface">
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-app-ink">{c.name}</span> <span className="text-xs text-app-muted">{c.code}</span>
        </div>
        <span className={`text-xs ${c.cargos ? 'text-app-ink' : 'text-app-muted'}`}>
          {c.cargos ? `${(c.titulos || c.cargos).join(' + ')} · ${c.nivel}` : 'Sin homologar'}
        </span>
        {esAdmin && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onEditar(c) }}
            className="rounded-lg border border-app-line px-3 py-1 text-xs font-medium text-app-ink hover:border-app-ink">
            Editar
          </button>
        )}
      </div>
      {abierto && <Detalle c={c} estudio={estudio} />}
    </div>
  )
}

export default function CargosEmpresa({ estudio, cargos, esAdmin, onEditar }) {
  const [q, setQ] = useState('')
  if (!cargos) return <p className="text-sm text-app-muted">Cargando…</p>

  const t = q.trim().toLowerCase()
  const lista = cargos.filter((c) => !t || `${c.name} ${c.code}`.toLowerCase().includes(t))

  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cargo de la empresa"
        className="w-full rounded-lg border border-app-line px-3 py-2 text-[13px] text-app-ink focus:border-app-ink focus:outline-none" />
      {lista.length === 0 ? (
        <p className="text-sm text-app-muted">No hay cargos para mostrar.</p>
      ) : (
        <div className="divide-y divide-app-line rounded-xl border border-app-line bg-white text-sm">
          {lista.map((c) => <Fila key={c.id} c={c} estudio={estudio} esAdmin={esAdmin} onEditar={onEditar} />)}
        </div>
      )}
    </div>
  )
}
