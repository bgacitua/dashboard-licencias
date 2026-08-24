import React, { useState } from 'react'
import SidebarLayout from '../components/SidebarLayout'
import TablaDinamica from '../features/asistencia/TablaDinamica'
import { useObras, useVista } from '../features/asistencia/useVista'
import AsistenciaService from '../services/asistencia.service'

// Las cuatro vistas comparten la forma de respuesta del backend; lo único que
// cambia es el endpoint y si usan el rango de fechas.
const VISTAS = [
  { id: 'marcajes', label: 'Marcajes', rango: true },
  { id: 'auditoria', label: 'Auditoría de Marcas', rango: true },
  { id: 'inasistencias', label: 'Inasistencias', rango: true },
  { id: 'recinto-trabajador', label: 'Recinto por Trabajador', rango: false },
]

const hoy = () => new Date().toISOString().slice(0, 10)
const haceDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const Asistencia = () => {
  const [vista, setVista] = useState('marcajes')
  const [desde, setDesde] = useState(haceDias(7))
  const [hasta, setHasta] = useState(hoy())
  const [obraId, setObraId] = useState('')

  const obras = useObras()
  const actual = VISTAS.find((v) => v.id === vista)
  // Las vistas sin rango ignoran las fechas: no las mandamos para no romper su
  // clave de caché en el backend.
  const { rows, columns, descartados, loading, error, recargar } = useVista(
    vista,
    actual.rango ? { desde, hasta, obraId } : { obraId }
  )

  const [descargando, setDescargando] = useState(false)
  const descargar = async () => {
    setDescargando(true)
    try {
      await AsistenciaService.descargarCsv({ desde, hasta, obraId })
    } finally {
      setDescargando(false)
    }
  }

  return (
    <SidebarLayout>
      <main className="p-8">
        <header className="flex items-center gap-2 text-sm text-app-muted mb-8">
          <span className="material-symbols-outlined text-lg">home</span>
          <span>/</span>
          <span className="text-app-ink font-medium">Asistencia</span>
        </header>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-app-ink mb-1">Control de Asistencia</h1>
          <p className="text-app-muted">
            Marcajes, auditoría e inasistencias del personal de obra.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-app-line p-6">
          <div className="flex flex-wrap gap-2 mb-6 border-b border-app-line">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                onClick={() => setVista(v.id)}
                className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                  vista === v.id
                    ? 'border-app-brand text-app-brand'
                    : 'border-transparent text-app-muted hover:text-app-ink'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3 mb-6">
            {actual.rango && (
              <>
                <label className="text-sm text-app-muted">
                  Desde
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                    className="block mt-1 text-sm border border-app-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-app-ink"
                  />
                </label>
                <label className="text-sm text-app-muted">
                  Hasta
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                    className="block mt-1 text-sm border border-app-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-app-ink"
                  />
                </label>
              </>
            )}

            <label className="text-sm text-app-muted">
              Obra
              <select
                value={obraId}
                onChange={(e) => setObraId(e.target.value)}
                className="block mt-1 text-sm border border-app-line rounded px-2 py-1.5 text-app-ink focus:outline-none focus:ring-1 focus:ring-app-ink"
              >
                <option value="">Todas</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={recargar}
              className="p-2 text-app-outline hover:text-app-brand hover:bg-app-surface rounded-full transition-colors"
              title="Actualizar tabla"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>

            {vista === 'marcajes' && (
              <button
                onClick={descargar}
                disabled={descargando || loading}
                className="ml-auto px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40"
              >
                {descargando ? 'Generando…' : 'Exportar CSV'}
              </button>
            )}
          </div>

          <TablaDinamica
            rows={rows}
            columns={columns}
            descartados={descartados}
            loading={loading}
            error={error}
          />
        </div>
      </main>
    </SidebarLayout>
  )
}

export default Asistencia
