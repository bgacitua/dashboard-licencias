import React, { useEffect, useState } from 'react'
import SidebarLayout from '../components/SidebarLayout'
import Notificaciones from '../features/asistencia/Notificaciones'
import AsistenciaService from '../services/asistencia.service'
import TablaDinamica from '../features/asistencia/TablaDinamica'
import { descargarCsv } from '../features/asistencia/exportar'
import CorreccionMarcas from '../features/asistencia/CorreccionMarcas'
import Historial from '../features/asistencia/Historial'
import { useObras, useVista } from '../features/asistencia/useVista'

// Orden de uso: se mira lo que pasó (Marcajes), se corrige, y recién después
// vienen las vistas de consulta. Auditoría queda al final porque se abre cuando
// algo no cuadra, no todos los días. Los reportes viven en /asistencia/reportes.
//
// Las vistas comunes comparten la forma de respuesta del backend; lo único que
// cambia es el endpoint y si usan el rango de fechas.
const VISTAS = [
  { id: 'marcajes', label: 'Marcajes', rango: true },
  { id: 'correccion', label: 'Corrección de Marcas', rango: true, propia: true },
  { id: 'recinto-trabajador', label: 'Recinto por Trabajador', rango: false },
  { id: 'historial', label: 'Historial', rango: true, propia: true },
  { id: 'auditoria', label: 'Auditoría de Marcas', rango: true },
]

// Cada medio minuto: las respuestas llegan de a una y por correo, así que el
// contador puede ir unos segundos atrasado sin que a nadie le importe.
const REFRESCO_BADGE = 30000

const hoy = () => new Date().toISOString().slice(0, 10)
const haceDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// El contador del círculo rojo. Se refresca solo y, además, cada vez que se
// abre o cierra el panel: al cerrarlo hay que reflejar lo que se gestionó.
const usePendientes = (panel) => {
  const [n, setN] = useState(0)

  useEffect(() => {
    let vivo = true
    const leer = () =>
      AsistenciaService.getNotificaciones()
        .then((d) => vivo && setN(d.pendientes || 0))
        // Un contador caído no puede romper la página: se queda en el último valor.
        .catch(() => {})
    leer()
    const id = setInterval(leer, REFRESCO_BADGE)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [panel])

  return n
}

// Panel de la campana. Overlay y no pestaña: se abre sobre lo que se estaba
// mirando y se cierra con Escape o clickeando fuera, como cualquier dropdown.
const PanelNotificaciones = ({ onClose, onRegistrarMarca }) => {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-30 bg-black/20 flex justify-end"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="w-full max-w-xl h-full bg-white shadow-xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Respuestas de jefatura"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-app-ink">Respuestas de jefatura</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 grid place-items-center text-app-muted hover:text-app-ink
                       hover:bg-app-surface rounded-full transition-colors"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined text-base leading-none">close</span>
          </button>
        </div>
        <Notificaciones onRegistrarMarca={onRegistrarMarca} />
      </aside>
    </div>
  )
}

const Asistencia = () => {
  const [panel, setPanel] = useState(false)
  // {rut, fecha} que llega desde una notificación "Olvidó marcar".
  const [prefillMarca, setPrefillMarca] = useState(null)
  const [vista, setVista] = useState('marcajes')
  const [desde, setDesde] = useState(haceDias(7))
  const [hasta, setHasta] = useState(hoy())
  const [obraId, setObraId] = useState('')

  const obras = useObras()
  const actual = VISTAS.find((v) => v.id === vista)
  const pendientes = usePendientes(panel)
  // Las vistas sin rango ignoran las fechas: no las mandamos para no romper su
  // clave de caché en el backend.
  const { rows, columns, descartados, loading, error, recargar } = useVista(
    // Las vistas propias no consultan las vistas comunes; el hook igual corre
    // (no puede ser condicional) pero sin vista no pide nada.
    actual.propia ? null : vista,
    actual.rango ? { desde, hasta, obraId } : { obraId }
  )

  return (
    <SidebarLayout>
      <main className="p-8">
        <header className="flex items-center gap-2 text-sm text-app-muted mb-8">
          <span className="material-symbols-outlined text-lg">home</span>
          <span>/</span>
          <span className="text-app-ink font-medium">Asistencia</span>
        </header>

        <div className="mb-8 flex items-start gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-app-ink mb-1">Control de Asistencia</h1>
            <p className="text-app-muted">
              Marcajes, auditoría e inasistencias del personal de obra.
            </p>
          </div>

          {/* La campana vive acá y no en una pestaña: las respuestas de
              jefatura llegan solas, no son una vista que uno vaya a consultar.
              El panel se abre encima para no perder la tabla que se miraba. */}
          <button
            onClick={() => setPanel(true)}
            className="relative p-2 text-app-outline hover:text-app-brand hover:bg-app-surface
                       rounded-full transition-colors"
            title="Respuestas de jefatura"
            aria-label={
              pendientes
                ? `Notificaciones: ${pendientes} sin gestionar`
                : 'Notificaciones'
            }
          >
            <span className="material-symbols-outlined">notifications</span>
            {pendientes > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full
                           bg-red-600 text-white text-xs font-bold
                           flex items-center justify-center"
              >
                {pendientes > 99 ? '99+' : pendientes}
              </span>
            )}
          </button>
        </div>

        {panel && (
          <PanelNotificaciones
            onClose={() => setPanel(false)}
            // "Olvidó marcar" no es permiso: se vuelve a la fila que originó
            // el aviso, con el mismo recinto y el mismo día, y la búsqueda ya
            // puesta en ese trabajador. Desde ahí se registra la marca.
            onRegistrarMarca={({ rut, fecha, obraId: obraNotif }) => {
              setDesde(fecha)
              setHasta(fecha)
              if (obraNotif) setObraId(obraNotif)
              setPrefillMarca({ rut, fecha })
              setVista('correccion')
              setPanel(false)
            }}
          />
        )}

        <div className="bg-white rounded-xl border border-app-line p-6">
          {/* La barra se queda arriba al scrollear una tabla larga; el blur es
              para que las filas que pasan por debajo no compitan con las
              pestañas. Sin el fondo translúcido el backdrop-filter no hace nada. */}
          <div className="sticky top-0 z-10 -mx-2 mb-6 px-2 py-2 flex flex-wrap gap-2
                          rounded-2xl border border-app-line/60 bg-white/70 backdrop-blur-md
                          supports-[backdrop-filter]:bg-white/60">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                onClick={() => setVista(v.id)}
                className={`relative px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                  vista === v.id
                    ? 'text-app-brand bg-app-surface'
                    : 'text-app-muted hover:text-app-ink hover:bg-app-surface/60'
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

            {!actual.propia && (
            <button
              onClick={recargar}
              className="p-2 text-app-outline hover:text-app-brand hover:bg-app-surface rounded-full transition-colors"
              title="Actualizar tabla"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
            )}

            {!actual.propia && (
            <button
              onClick={() => descargarCsv(rows, columns, vista)}
              disabled={loading || !rows.length}
              className="ml-auto px-3 py-1.5 text-sm rounded text-app-ink hover:bg-app-surface transition-colors disabled:opacity-40"
            >
              Exportar CSV
            </button>
            )}
          </div>

          {vista === 'correccion' ? (
            <CorreccionMarcas
              desde={desde}
              hasta={hasta}
              obraId={obraId}
              obras={obras}
              prefillMarca={prefillMarca}
            />
          ) : vista === 'historial' ? (
            <Historial desde={desde} hasta={hasta} />
          ) : (
          <TablaDinamica
            rows={rows}
            columns={columns}
            descartados={descartados}
            loading={loading}
            error={error}
          />
          )}
        </div>
      </main>
    </SidebarLayout>
  )
}

export default Asistencia
