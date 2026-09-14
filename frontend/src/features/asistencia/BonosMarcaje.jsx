import React, { useState } from 'react'
import DescargasBonos from './DescargasBonos'
import { useObras, useVista } from './useVista'

const hoy = () => new Date().toISOString().slice(0, 10)
const haceDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Los tres bonos que se calculan sobre el dataset de Marcajes.
 *
 * Antes colgaban del tab Marcajes porque reusaban sus filas ya cargadas. Acá
 * traen su propio rango: es la misma vista `marcajes` del backend, que cachea
 * el crawl de Buk por 15 minutos con clave desde|hasta, así que repetir el
 * rango que ya se consultó en el tab no vuelve a golpear la API externa.
 *
 * El rango de acá es el de la CONSULTA, no el del bono: cada descarga elige su
 * propio periodo adentro y avisa si el rango cargado no lo cubre.
 */
const BonosMarcaje = () => {
  const [desde, setDesde] = useState(haceDias(7))
  const [hasta, setHasta] = useState(hoy())
  const [obraId, setObraId] = useState('')

  const obras = useObras()
  const { rows, loading, error, recargar } = useVista('marcajes', { desde, hasta, obraId })

  const campo = 'block mt-1 text-sm border border-app-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-app-ink'

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-sm text-app-muted">
          Desde
          <input type="date" value={desde} className={campo}
            onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="text-sm text-app-muted">
          Hasta
          <input type="date" value={hasta} className={campo}
            onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label className="text-sm text-app-muted">
          Obra
          <select value={obraId} onChange={(e) => setObraId(e.target.value)}
            className={`${campo} text-app-ink`}>
            <option value="">Todas</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}</option>
            ))}
          </select>
        </label>
        <button
          onClick={recargar}
          className="p-2 text-app-outline hover:text-app-brand hover:bg-app-surface rounded-full transition-colors"
          title="Actualizar datos"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      <p className="text-sm text-app-muted mb-4">
        {loading
          ? 'Cargando marcajes…'
          : error || `${rows.length.toLocaleString('es-CL')} marcajes cargados en el rango.`}
      </p>

      <DescargasBonos rows={rows} desde={desde} hasta={hasta} />
    </div>
  )
}

export default BonosMarcaje
