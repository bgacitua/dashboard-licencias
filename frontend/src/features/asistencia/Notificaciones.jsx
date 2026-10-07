import React, { useEffect, useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'

// Motivos que no generan permiso en Buk. "Olvidó marcar" se arregla
// registrando la marca, que es otro flujo (Corrección de Marcas).
const SIN_PERMISO = new Set(['Olvidó marcar'])
// "Otro motivo" no tiene tipo fijo: lo dice el comentario, así que lo elige
// quien gestiona. El backend igual lo exige.
const PIDE_TIPO = new Set(['Otro motivo'])

const dmy = (iso) => (iso || '').split('-').reverse().join('-')

const fechaHora = (iso) =>
  iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : ''

const Notificaciones = () => {
  const [items, setItems] = useState([])
  const [todas, setTodas] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // token|fecha de la fila en curso: evita doble click sobre una escritura real.
  const [enCurso, setEnCurso] = useState('')
  const [tipos, setTipos] = useState({})

  const cargar = async (verTodas = todas) => {
    setLoading(true)
    setError('')
    try {
      const data = await AsistenciaService.getNotificaciones(verTodas)
      setItems(data.items || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudieron cargar las notificaciones.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar(todas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas])

  const clave = (n) => `${n.token}|${n.fecha}`

  const gestionar = async (n, accion) => {
    setEnCurso(clave(n))
    setError('')
    try {
      if (accion === 'permiso') {
        const r = await AsistenciaService.crearPermiso(n.token, n.fecha, tipos[clave(n)] || '')
        if (r.dry_run) setError('DRY_RUN: el permiso NO se creó en Buk, solo se registró acá.')
      } else {
        await AsistenciaService.descartarNotificacion(n.token, n.fecha)
      }
      await cargar()
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo completar la acción.')
    } finally {
      setEnCurso('')
    }
  }

  if (loading) return <p className="text-sm text-app-muted">Cargando notificaciones…</p>

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-sm text-app-muted">
          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
          Ver también las ya gestionadas
        </label>
        <button
          onClick={() => cargar()}
          className="ml-auto p-2 text-app-outline hover:text-app-brand hover:bg-app-surface rounded-full transition-colors"
          title="Actualizar"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {!items.length ? (
        <p className="text-sm text-app-muted">
          {todas ? 'Sin respuestas de jefatura.' : 'No hay respuestas pendientes de gestionar.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li
              key={clave(n)}
              className="border border-app-line rounded-xl p-4 flex flex-wrap gap-4 items-start"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-app-ink">
                  {n.nombre}{' '}
                  <span className="text-app-muted font-normal">· RUT {n.rut}</span>
                </p>
                <p className="text-sm text-app-muted">
                  Fecha consultada: <strong className="text-app-ink">{dmy(n.fecha)}</strong> ·
                  Respuesta: <strong className="text-app-ink">{n.respuesta}</strong>
                </p>
                <p className="text-sm text-app-muted">
                  Respondió {n.jefatura} · {fechaHora(n.respondido_at)}
                </p>
                {n.comentario && (
                  <p className="mt-2 text-sm text-app-ink bg-app-surface rounded px-3 py-2 whitespace-pre-wrap">
                    {n.comentario}
                  </p>
                )}
                {n.gestion && (
                  <p className="mt-2 text-sm text-app-muted">
                    {n.gestion === 'permiso' ? 'Permiso creado' : 'Descartada'}
                    {n.gestion_por && ` por ${n.gestion_por}`}
                    {n.gestion_at && ` · ${fechaHora(n.gestion_at)}`}
                    {n.buk_ref && ` · Buk ${n.buk_ref}`}
                  </p>
                )}
              </div>

              {!n.gestion && (
                <div className="flex flex-wrap items-center gap-2">
                  {PIDE_TIPO.has(n.respuesta) && (
                    <input
                      type="text"
                      placeholder="Tipo en Buk"
                      value={tipos[clave(n)] || ''}
                      onChange={(e) => setTipos({ ...tipos, [clave(n)]: e.target.value })}
                      className="text-sm border border-app-line rounded px-2 py-1.5 w-36"
                    />
                  )}
                  {!SIN_PERMISO.has(n.respuesta) && (
                    <button
                      onClick={() => gestionar(n, 'permiso')}
                      disabled={enCurso === clave(n)}
                      className="px-3 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40"
                    >
                      Crear permiso en Buk
                    </button>
                  )}
                  <button
                    onClick={() => gestionar(n, 'descartar')}
                    disabled={enCurso === clave(n)}
                    className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default Notificaciones
