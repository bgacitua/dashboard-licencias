import React, { useEffect, useState } from 'react'
import { postResultado } from '../services/compensaciones'
import { LOCALE } from './PasoResultado'
import EvaluacionHay from './EvaluacionHay'

const ESTADISTICAS = [['p25', 'P25'], ['mediana', 'Mediana'], ['promedio', 'Promedio'], ['p75', 'P75']]

// Cifras de la homologación vigente: COMP1 mensual (cargos / híbrido) y COMP3_REAL anual (subfamilia / promedio).
function Detalle({ c, estudio, evaluados, esAdmin, onHay }) {
  const [r, setR] = useState(null)
  const [hay, setHay] = useState(false)
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
      {c.cargos && ( // descriptores Mercer con los que se hizo match, uno por código
        <details className="text-xs text-app-muted">
          <summary className="cursor-pointer">
            Homologado con:{c.cargos.map((k) => <span key={k} className="ml-3 select-all font-mono text-app-ink">{k}.{c.nivel}</span>)}
          </summary>
          {c.descriptores?.map((d) => (
            <div key={d.codigo} className="mt-2 border-l-2 border-app-line pl-3">
              <p><span className="font-mono text-app-ink">{d.codigo}</span> · {estudio.vista}</p>
              <p className="font-semibold text-app-ink">{d.titulo}</p>
              <p className="whitespace-pre-line">{d.descripcion || 'Sin descriptor en el estudio.'}</p>
            </div>
          ))}
        </details>
      )}
      {esAdmin && ( // la calculadora HAY es solo del admin; el resto ve el grado en la fila
        <button type="button" onClick={() => setHay(!hay)} className="text-xs font-medium text-app-muted hover:text-app-ink">
          {hay ? '▾' : '▸'} Evaluación HAY
        </button>
      )}
      {hay && <EvaluacionHay c={c} evaluados={evaluados} onGuardado={(h) => onHay(c.id, h)} />}
    </div>
  )
}

function Fila({ c, estudio, evaluados, esAdmin, onEditar, onHay }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div>
      <div onClick={() => setAbierto(!abierto)} className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-app-surface">
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-app-ink">{c.name}</span> <span className="text-xs text-app-muted">{c.code}</span>
          <p className={`text-xs ${c.cargos ? 'text-app-ink' : 'text-app-muted'}`}>
            {c.cargos ? `${(c.titulos || c.cargos).join(' + ')} · ${c.nivel}` : 'Sin homologar'}
          </p>
        </div>
        <span className={`w-14 text-right text-xs ${c.personas ? 'text-app-ink' : 'text-app-muted'}`}>{c.personas} pers.</span>
        <span title={c.hay_grado != null ? `${c.hay_puntos} puntos HAY` : 'Sin evaluación HAY'}
          className={`w-14 text-right text-xs ${c.hay_grado != null ? 'text-app-ink' : 'text-app-muted'}`}>
          {c.hay_grado != null ? `HAY ${c.hay_grado}` : 'HAY –'}
        </span>
        {esAdmin && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onEditar(c) }}
            className="rounded-lg border border-app-line px-3 py-1 text-xs font-medium text-app-ink hover:border-app-ink">
            Editar
          </button>
        )}
      </div>
      {abierto && <Detalle c={c} estudio={estudio} evaluados={evaluados} esAdmin={esAdmin} onHay={onHay} />}
    </div>
  )
}

export default function CargosEmpresa({ estudio, cargos, todos, esAdmin, soloActivos, onSoloActivos, onEditar, onHay }) {
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState('') // '' original | desc | asc por grado HAY
  if (!cargos) return <p className="text-sm text-app-muted">Cargando…</p>

  const t = q.trim().toLowerCase()
  const lista = cargos.filter((c) => !t || `${c.name} ${c.code}`.toLowerCase().includes(t))
  // Sin HAY siempre al final; a igual grado se mantiene el orden original (sort estable)
  if (orden) lista.sort((a, b) => (a.hay_grado == null) - (b.hay_grado == null) || (orden === 'asc' ? 1 : -1) * ((a.hay_grado ?? 0) - (b.hay_grado ?? 0)))
  const sinHay = cargos.filter((c) => c.hay_grado == null)
  const evaluados = todos.filter((c) => c.hay_grado != null) // fuente para copiar HAY: todos, no solo los visibles
  const suma = (l) => l.reduce((n, c) => n + c.personas, 0)

  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cargo de la empresa"
        className="w-full rounded-lg border border-app-line px-3 py-2 text-[13px] text-app-ink focus:border-app-ink focus:outline-none" />
      <div className="flex flex-wrap items-center gap-3 text-xs text-app-muted">
        <label className="flex cursor-pointer items-center gap-2 text-app-ink">
          <input type="checkbox" role="switch" checked={soloActivos} onChange={(e) => onSoloActivos(e.target.checked)}
            className="h-4 w-4 accent-app-brand" />
          Solo cargos con personas activas
        </label>
        <select value={orden} onChange={(e) => setOrden(e.target.value)}
          className="rounded-lg border border-app-line bg-white px-2 py-1 text-xs text-app-ink">
          <option value="">Orden original</option>
          <option value="desc">HAY mayor a menor</option>
          <option value="asc">HAY menor a mayor</option>
        </select>
        <span className="ml-auto">
          {cargos.length} cargos ({suma(cargos)} personas) · {cargos.filter((c) => !c.cargos).length} sin homologar · {sinHay.length} sin HAY ({suma(sinHay)} personas)
        </span>
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-app-muted">No hay cargos para mostrar.</p>
      ) : (
        <div className="divide-y divide-app-line rounded-xl border border-app-line bg-white text-sm">
          {lista.map((c) => <Fila key={c.id} c={c} estudio={estudio} evaluados={evaluados} esAdmin={esAdmin} onEditar={onEditar} onHay={onHay} />)}
        </div>
      )}
    </div>
  )
}
