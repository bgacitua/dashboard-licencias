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

// El backend guarda el RUT sin puntos ni DV, que es la clave con la que se
// cruza todo. Acá se muestra como se lee en papel; el valor que viaja a la API
// sigue siendo el normalizado.
const formatearRut = (cuerpo) => {
  const n = String(cuerpo ?? '').replace(/\D/g, '')
  if (!n) return cuerpo || ''
  let suma = 0
  let factor = 2
  for (let i = n.length - 1; i >= 0; i--) {
    suma += Number(n[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  return `${n.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

// Una tarjeta por aviso (token): un trabajador con todas sus fechas juntas, que
// es como salió el correo. El orden de la API ya viene por respuesta más
// reciente; agrupar con un Map lo conserva.
const agrupar = (items) => {
  const porToken = new Map()
  for (const it of items) {
    const g = porToken.get(it.token)
    if (g) g.fechas.push(it)
    else porToken.set(it.token, { ...it, fechas: [it] })
  }
  return [...porToken.values()]
}

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

  const clave = (f) => `${f.token}|${f.fecha}`

  const gestionar = async (f, accion) => {
    setEnCurso(clave(f))
    setError('')
    try {
      if (accion === 'permiso') {
        const r = await AsistenciaService.crearPermiso(f.token, f.fecha, tipos[clave(f)] || '')
        if (r.dry_run) setError('DRY_RUN: el permiso NO se creó en Buk, solo se registró acá.')
      } else {
        await AsistenciaService.descartarNotificacion(f.token, f.fecha)
      }
      await cargar()
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo completar la acción.')
    } finally {
      setEnCurso('')
    }
  }

  if (loading) return <p className="text-xs text-app-muted">Cargando notificaciones…</p>

  const grupos = agrupar(items)

  return (
    <div className="text-sm">
      <div className="flex items-center gap-3 mb-3">
        <label className="flex items-center gap-2 text-xs text-app-muted">
          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
          Ver también las ya gestionadas
        </label>
        <button
          onClick={() => cargar()}
          className="ml-auto p-1.5 text-app-outline hover:text-app-brand hover:bg-app-surface rounded-full transition-colors"
          title="Actualizar"
        >
          <span className="material-symbols-outlined text-lg">refresh</span>
        </button>
      </div>

      {error && (
        <p className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {!grupos.length ? (
        <p className="text-xs text-app-muted">
          {todas ? 'Sin respuestas de jefatura.' : 'No hay respuestas pendientes de gestionar.'}
        </p>
      ) : (
        // Sin bordes ni relleno por tarjeta: con el texto chico competían entre
        // sí. Una línea divisoria y un hover suave bastan para separarlas.
        <ul className="divide-y divide-app-line">
          {grupos.map((g) => (
            <li key={g.token} className="py-3 px-2 -mx-2 rounded-lg hover:bg-app-surface/60">
              <p className="font-medium text-app-ink leading-tight">{g.nombre}</p>
              <p className="text-xs text-app-muted">{formatearRut(g.rut)}</p>

              <ul className="mt-2 space-y-0.5">
                {g.fechas.map((f) => (
                  <li key={clave(f)} className="text-xs flex flex-wrap gap-x-2">
                    <span className="text-app-muted tabular-nums">{dmy(f.fecha)}</span>
                    <span className="text-app-ink font-medium">{f.respuesta}</span>
                    {f.gestion && (
                      <span className="text-app-muted">
                        · {f.gestion === 'permiso' ? 'permiso creado' : 'descartada'}
                        {f.gestion_por && ` por ${f.gestion_por}`}
                        {f.buk_ref && ` · Buk ${f.buk_ref}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <p className="mt-2 text-xs text-app-muted">
                Respondió {g.jefatura} · {fechaHora(g.respondido_at)}
              </p>
              {g.comentario && (
                <p className="mt-1 text-xs text-app-ink whitespace-pre-wrap">“{g.comentario}”</p>
              )}

              {/* Las acciones abajo, una línea por fecha pendiente: el permiso
                  se crea por fecha, no por aviso. */}
              {g.fechas.some((f) => !f.gestion) && (
                <div className="mt-2 space-y-1.5">
                  {g.fechas
                    .filter((f) => !f.gestion)
                    .map((f) => (
                      <div key={clave(f)} className="flex flex-wrap items-center gap-1.5">
                        {g.fechas.length > 1 && (
                          <span className="text-xs text-app-muted tabular-nums w-20">
                            {dmy(f.fecha)}
                          </span>
                        )}
                        {PIDE_TIPO.has(f.respuesta) && (
                          <input
                            type="text"
                            placeholder="Tipo en Buk"
                            value={tipos[clave(f)] || ''}
                            onChange={(e) => setTipos({ ...tipos, [clave(f)]: e.target.value })}
                            className="text-xs border border-app-line rounded px-2 py-1 w-28"
                          />
                        )}
                        {!SIN_PERMISO.has(f.respuesta) && (
                          <button
                            onClick={() => gestionar(f, 'permiso')}
                            disabled={enCurso === clave(f)}
                            className="px-2.5 py-1 text-xs rounded bg-app-brand text-white disabled:opacity-40"
                          >
                            Crear permiso
                          </button>
                        )}
                        <button
                          onClick={() => gestionar(f, 'descartar')}
                          disabled={enCurso === clave(f)}
                          className="px-2.5 py-1 text-xs border border-app-line rounded hover:bg-white disabled:opacity-40"
                        >
                          Descartar
                        </button>
                      </div>
                    ))}
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
