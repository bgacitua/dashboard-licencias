import React, { useEffect, useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'

// Motivos que no generan permiso en Buk. "Olvidó marcar" se arregla
// registrando la marca, que es otro flujo (Corrección de Marcas).
const SIN_PERMISO = new Set(['Olvidó marcar'])
// Motivos que pueden terminar en cualquiera de los dos lados: lo dice el
// comentario de la jefatura, así que se ofrecen ambos y elige quien gestiona.
const AMBOS = new Set(['Otro motivo'])
// "Otro motivo" no tiene tipo fijo: lo dice el comentario, así que lo elige
// quien gestiona. El backend igual lo exige.
const PIDE_TIPO = new Set(['Otro motivo'])

// Lo que se crea en Buk no se puede deshacer desde acá, así que la ventana
// para arrepentirse va antes de mandar, no después.
const SEGUNDOS_DESHACER = 5

// Cómo se cerró la notificación, tal como lo guarda el backend.
const GESTION = {
  permiso: 'permiso creado',
  descartada: 'descartada',
  marca: 'pasó a corrección de marcas',
}

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

// Buk cuenta días corridos: las fechas consecutivas con el mismo motivo son un
// solo permiso de N días, y un hueco en el calendario abre otro. Mismo corte
// que hace el backend, que es quien manda al crear.
export const rachas = (fechas) => {
  const grupos = []
  let previa = null
  let motivo = null
  for (const f of [...fechas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    // En UTC a propósito: con hora local, el día del cambio de horario dura 23
    // o 25 horas y la racha se cortaría sola dos veces al año.
    const dia = new Date(`${f.fecha}T00:00:00Z`)
    const sigue =
      previa && f.respuesta === motivo && (dia - previa) === 86400000
    if (sigue) grupos[grupos.length - 1].push(f)
    else grupos.push([f])
    previa = dia
    motivo = f.respuesta
  }
  return grupos
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

const Notificaciones = ({ onRegistrarMarca }) => {
  const [items, setItems] = useState([])
  const [todas, setTodas] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // token|fecha de la fila en curso: evita doble click sobre una escritura real.
  const [enCurso, setEnCurso] = useState('')
  const [tipos, setTipos] = useState({})
  // Catálogo de Buk para el select: viene del backend, que es quien manda al
  // crear. Si no carga, el select queda vacío y el backend igual exige el tipo.
  const [tiposBuk, setTiposBuk] = useState([])
  // Fecha de aplicación por tramo; vacía = el backend usa el primer día.
  const [aplicacion, setAplicacion] = useState({})
  // Acción agendada que todavía se puede cancelar: {k, tramo, accion, segundos}.
  const [pendiente, setPendiente] = useState(null)
  const [aviso, setAviso] = useState(null)

  // `silencioso` recarga sin vaciar la pantalla: después de gestionar, poner
  // "Cargando…" en lugar de la lista mandaba la vista de vuelta al principio.
  const cargar = async (verTodas = todas, silencioso = false) => {
    if (!silencioso) setLoading(true)
    setError('')
    try {
      const data = await AsistenciaService.getNotificaciones(verTodas)
      setItems(data.items || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudieron cargar las notificaciones.')
    } finally {
      if (!silencioso) setLoading(false)
    }
  }

  useEffect(() => {
    cargar(todas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas])

  useEffect(() => {
    AsistenciaService.getTiposPermiso()
      .then((d) => setTiposBuk(d.tipos || []))
      .catch(() => setTiposBuk([]))
  }, [])

  const clave = (f) => `${f.token}|${f.fecha}`

  // `tramo` son las fechas de una racha: el permiso lo arma el backend a
  // partir de la primera, pero descartar sí hay que pedirlo fecha por fecha.
  const gestionar = async (tramo, accion) => {
    const f = tramo[0]
    const k = clave(f)
    setEnCurso(k)
    setError('')
    try {
      if (accion === 'permiso') {
        const r = await AsistenciaService.crearPermiso(
          f.token, f.fecha, tipos[k] || '', aplicacion[k] || ''
        )
        const dias = r.fechas?.length || tramo.length
        const quien = items.find((x) => x.token === f.token)?.nombre || f.rut
        setAviso({
          tono: r.dry_run ? 'alerta' : 'ok',
          texto: r.dry_run
            ? `DRY_RUN: no se creó nada en Buk. Habría sido ${quien}, ${dias} día(s).`
            : `Creado en Buk para ${quien}: ${dias} día(s)` +
              (r.buk_ref ? ` · referencia ${r.buk_ref}` : ''),
        })
      } else {
        for (const x of tramo) await AsistenciaService.descartarNotificacion(x.token, x.fecha)
        setAviso({ tono: 'ok', texto: `Descartado: ${tramo.length} fecha(s).` })
      }
      await cargar(todas, true)
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo completar la acción.')
    } finally {
      setEnCurso('')
    }
  }

  // "Olvidó marcar" no genera permiso: se cierra acá y se sigue en Corrección
  // de Marcas. Se marca el tramo antes de saltar para que no quede penando en
  // el centro; si la marca después no se registra, se ve en esa pantalla, no
  // acá. Sin cuenta regresiva: no escribe nada en Buk.
  const registrarMarca = async (tramo, g) => {
    const f = tramo[0]
    setEnCurso(clave(f))
    setError('')
    try {
      for (const x of tramo) await AsistenciaService.marcaRegistrada(x.token, x.fecha)
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo cerrar la notificación.')
      setEnCurso('')
      return
    }
    setEnCurso('')
    onRegistrarMarca({ rut: g.rut, fecha: f.fecha, obraId: g.obra_id })
  }

  // Buk no deja deshacer lo creado, así que la ventana para arrepentirse va
  // antes de mandar: el botón queda en cuenta regresiva y recién al llegar a
  // cero sale el request. Cancelar es simplemente no mandarlo.
  //
  // Descartar no escribe en Buk y se revierte mirando "ya gestionadas", así
  // que sale al tiro: esperar 5 segundos por fila hacía eterna una bandeja
  // llena de cosas que solo hay que sacar del medio.
  const programar = (tramo, accion) => {
    if (accion === 'descartar') {
      gestionar(tramo, accion)
      return
    }
    const k = clave(tramo[0])
    setPendiente({ k, tramo, accion, segundos: SEGUNDOS_DESHACER })
  }

  const cancelar = () => setPendiente(null)

  // El aviso se borra solo: deja de ser noticia a los pocos segundos y el
  // rastro permanente queda en la propia tarjeta, ya gestionada.
  useEffect(() => {
    if (!aviso) return undefined
    const id = setTimeout(() => setAviso(null), 8000)
    return () => clearTimeout(id)
  }, [aviso])

  useEffect(() => {
    if (!pendiente) return undefined
    if (pendiente.segundos === 0) {
      const { tramo, accion } = pendiente
      setPendiente(null)
      gestionar(tramo, accion)
      return undefined
    }
    const id = setTimeout(
      () => setPendiente((p) => (p ? { ...p, segundos: p.segundos - 1 } : p)),
      1000
    )
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendiente])

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
          className="ml-auto w-7 h-7 grid place-items-center text-app-muted hover:text-app-ink
                     hover:bg-app-surface rounded-full transition-colors"
          title="Actualizar"
        >
          <span className="material-symbols-outlined text-base leading-none">refresh</span>
        </button>
      </div>

      {error && (
        <p className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Lo que acaba de pasar, con la referencia de Buk: es el único rastro
          que queda de una escritura que no se puede consultar desde acá. */}
      {aviso && (
        <p
          className={`mb-3 text-xs rounded px-3 py-2 border ${
            aviso.tono === 'ok'
              ? 'text-green-800 bg-green-50 border-green-200'
              : 'text-amber-800 bg-amber-50 border-amber-200'
          }`}
        >
          {aviso.texto}
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
                        · {GESTION[f.gestion] || f.gestion}
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

              {/* Las acciones abajo, una línea por racha: el permiso cubre los
                  días corridos del mismo motivo, no cada fecha por separado. */}
              {g.fechas.some((f) => !f.gestion) && (
                <div className="mt-2 space-y-1.5">
                  {rachas(g.fechas.filter((f) => !f.gestion)).map((tramo) => {
                    const f = tramo[0]
                    return (
                      <div key={clave(f)} className="flex flex-wrap items-center gap-1.5">
                        {g.fechas.length > 1 && (
                          <span className="text-xs text-app-muted tabular-nums">
                            {tramo.length > 1
                              ? `${dmy(f.fecha)} a ${dmy(tramo[tramo.length - 1].fecha)} (${tramo.length}d)`
                              : dmy(f.fecha)}
                          </span>
                        )}
                        {PIDE_TIPO.has(f.respuesta) && (
                          <select
                            title="Tipo de permiso en Buk"
                            value={tipos[clave(f)] || ''}
                            onChange={(e) => setTipos({ ...tipos, [clave(f)]: e.target.value })}
                            className="text-xs border border-app-line rounded px-2 py-1"
                          >
                            <option value="">Tipo de permiso…</option>
                            {tiposBuk.map((t) => (
                              <option key={t.id} value={t.id}>{t.nombre}</option>
                            ))}
                          </select>
                        )}
                        {/* Esperando: un solo control, con lo que va a pasar y
                            cuánto queda para evitarlo. */}
                        {pendiente?.k === clave(f) ? (
                          <button
                            onClick={cancelar}
                            className="px-2.5 py-1 text-xs rounded
                                       text-app-brand bg-app-surface animate-pulse"
                          >
                            {pendiente.accion === 'permiso' ? 'Creando' : 'Descartando'} en{' '}
                            {pendiente.segundos}s · Deshacer
                          </button>
                        ) : enCurso === clave(f) ? (
                          <span className="px-2.5 py-1 text-xs text-app-muted">Enviando…</span>
                        ) : (
                          <>
                            {!SIN_PERMISO.has(f.respuesta) && (
                              <>
                                {/* Fecha de aplicación: por defecto el día de
                                    la inasistencia, se cambia cuando ese mes
                                    ya está cerrado en remuneraciones. */}
                                <input
                                  type="date"
                                  value={aplicacion[clave(f)] || f.fecha}
                                  onChange={(e) =>
                                    setAplicacion({ ...aplicacion, [clave(f)]: e.target.value })
                                  }
                                  title="Fecha de aplicación en Buk"
                                  className="text-xs border border-app-line rounded px-2 py-1"
                                />
                                <button
                                  onClick={() => programar(tramo, 'permiso')}
                                  // Sin tipo elegido el backend rechaza: mejor
                                  // que el botón lo diga antes de mandar.
                                  disabled={
                                    !!pendiente ||
                                    (PIDE_TIPO.has(f.respuesta) && !tipos[clave(f)])
                                  }
                                  className="px-2.5 py-1 text-xs rounded bg-app-brand text-white
                                             disabled:opacity-40"
                                >
                                  Crear permiso
                                </button>
                              </>
                            )}
                            {/* "Olvidó marcar" se arregla registrando la marca,
                                no con un permiso: se salta directo a ese flujo
                                con el RUT y la fecha ya puestos. En los motivos
                                que admiten las dos salidas, esta queda como
                                secundaria para no competir con el permiso. */}
                            {(SIN_PERMISO.has(f.respuesta) || AMBOS.has(f.respuesta))
                              && onRegistrarMarca && (
                              <button
                                onClick={() => registrarMarca(tramo, g)}
                                disabled={!!pendiente}
                                className={
                                  SIN_PERMISO.has(f.respuesta)
                                    ? 'px-2.5 py-1 text-xs rounded bg-app-brand text-white disabled:opacity-40'
                                    : 'px-2.5 py-1 text-xs rounded text-app-brand hover:bg-app-surface transition-colors disabled:opacity-40'
                                }
                              >
                                Registrar marca
                              </button>
                            )}
                            <button
                              onClick={() => programar(tramo, 'descartar')}
                              disabled={!!pendiente}
                              className="px-2.5 py-1 text-xs rounded
                                         hover:bg-white disabled:opacity-40"
                            >
                              Descartar
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
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
