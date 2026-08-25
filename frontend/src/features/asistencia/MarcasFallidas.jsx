import React, { useEffect, useMemo, useState } from 'react'

import AsistenciaService from '../../services/asistencia.service'
import { useVista } from './useVista'
import {
  TURNOS_DISPONIBLES,
  clasificar,
  construirJornadas,
  fechaApiDesdeIso,
  filtrarYOrdenar,
  horaApiDesdeHms,
  leerPlanilla,
  rangoDeJornadas,
} from './correccion'

/**
 * Marcas Fallidas: corrige jornadas incompletas con la hora del intento real.
 *
 * Se suben dos archivos. "Jornadas Incompletas" manda: es la lista de
 * días-persona a los que les falta una marca. "Marcas Fallidas" aporta la hora
 * en que el colaborador sí intentó marcar; lo que no cruza queda para completar
 * a mano.
 *
 * El sentido (entrada o salida) lo decide el turno con una ventana de ±2 h, y
 * se puede corregir fila por fila antes de enviar.
 */

const MOVS = ['Corrección Sentido Marca', 'Olvido de marca', 'Otro']
// Fin de turno típico, cuando la fila no tiene turno del cual sacarlo.
const HORA_POR_DEFECTO = '17:00:00'
// La selección masiva es por hoja, para no mandar cientos de marcas de un click.
const POR_HOJA = 50

const boton = 'px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40'
const campo = 'text-sm border border-app-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-app-ink'

const MarcasFallidas = ({ obraId, obras }) => {
  const [jornadas, setJornadas] = useState([])
  const [fallidas, setFallidas] = useState([])
  const [fallidasCargadas, setFallidasCargadas] = useState(false)
  const [rango, setRango] = useState({ desde: '', hasta: '' })
  const [errorArchivo, setErrorArchivo] = useState(null)

  // Overrides por fila: lo que el usuario corrige antes de enviar.
  const [sentidos, setSentidos] = useState(new Map())
  const [turnos, setTurnos] = useState(new Map())
  const [horas, setHoras] = useState(new Map())

  const [seleccion, setSeleccion] = useState(new Set())
  const [sincronizadas, setSincronizadas] = useState(new Set())
  const [pagina, setPagina] = useState(0)

  const [mov, setMov] = useState(MOVS[0])
  const [movLibre, setMovLibre] = useState('')
  const [operacion, setOperacion] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(null)

  const asignaciones = useVista(rango.desde ? 'asignacion-turnos' : null, { ...rango, obraId })

  const registros = useMemo(() => {
    if (!jornadas.length || !fallidasCargadas) return []
    return construirJornadas(jornadas, fallidas, asignaciones.rows ?? [])
  }, [jornadas, fallidas, fallidasCargadas, asignaciones.rows])

  const visibles = useMemo(
    () => registros.filter((r) => !sincronizadas.has(r.id)),
    [registros, sincronizadas]
  )

  // La operación deja la tanda guardada en el servidor: si se cierra la pestaña,
  // los registros preparados no se pierden.
  useEffect(() => {
    if (!registros.length || !obraId || !rango.desde || operacion) return
    AsistenciaService.crearOperacion({
      obra_id: obraId,
      desde: rango.desde,
      hasta: rango.hasta,
      label: `${obraId} ${rango.desde}→${rango.hasta}`,
      registros: registros.map((r) => ({
        record_id: r.id, rut: r.rut, nombre: r.nombre, fecha: r.fecha,
        hora_intento: r.horaIntento, sentido: r.sentido,
        turno_inicio: r.turnoInicio, turno_fin: r.turnoFin,
      })),
    })
      .then((op) => setOperacion(op.id))
      .catch(() => setOperacion(null))
  }, [registros, obraId, rango.desde, rango.hasta, operacion])

  const turnoDe = (r) => {
    const elegido = turnos.get(r.id) ?? ''
    return r.sinTurno && elegido ? elegido.split('-') : [r.turnoInicio, r.turnoFin]
  }

  const horaPorDefecto = (r) => {
    const fin = turnoDe(r)[1]?.trim()
    if (!fin) return HORA_POR_DEFECTO
    return `${fin}:00`.split(':').slice(0, 3).map((p) => p.padStart(2, '0')).join(':')
  }

  const horaDe = (r) => (r.matched ? r.horaIntento : horas.get(r.id) ?? horaPorDefecto(r))

  // Sin turno no se puede clasificar la marca: hay que elegir uno primero.
  const utilizable = (r) => Boolean(horaDe(r)) && (!r.sinTurno || turnos.has(r.id))

  const sentidoDe = (r) => {
    const override = sentidos.get(r.id)
    if (override) return override
    const [ini, fin] = turnoDe(r)
    const hora = horaDe(r)
    if (!ini || !fin || !hora) return r.sentido
    const clase = clasificar(hora, ini, fin)
    return clase === 'salida' ? 'salida' : 'entrada'
  }

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_HOJA))
  useEffect(() => {
    if (pagina >= paginas) setPagina(paginas - 1)
  }, [pagina, paginas])

  const hoja = useMemo(
    () => visibles.slice(pagina * POR_HOJA, (pagina + 1) * POR_HOJA),
    [visibles, pagina]
  )

  const marcarEstado = (ids, status) => {
    if (operacion && ids.length) {
      AsistenciaService.actualizarRegistros(
        operacion,
        ids.map((id) => ({ record_id: id, status }))
      ).catch(() => null)
    }
  }

  const alternarHoja = (marcar) => {
    const ids = hoja.filter(utilizable).map((r) => r.id)
    setSeleccion((prev) => {
      const n = new Set(prev)
      ids.forEach((id) => (marcar ? n.add(id) : n.delete(id)))
      return n
    })
    marcarEstado(ids, marcar ? 'pending' : 'discarded')
  }

  const alternarFila = (id, marcar) => {
    setSeleccion((prev) => {
      const n = new Set(prev)
      if (marcar) n.add(id)
      else n.delete(id)
      return n
    })
    marcarEstado([id], marcar ? 'pending' : 'discarded')
  }

  const descartarManuales = () => {
    const ids = visibles.filter((r) => !r.matched).map((r) => r.id)
    if (!ids.length) return
    setSeleccion((prev) => {
      const n = new Set(prev)
      ids.forEach((id) => n.delete(id))
      return n
    })
    marcarEstado(ids, 'discarded')
  }

  const cargarJornadas = async (file) => {
    if (!file) return
    setErrorArchivo(null)
    setResultado(null)
    setOperacion(null)
    setSincronizadas(new Set())
    try {
      const filas = await leerPlanilla(file)
      setJornadas(filas)
      setRango(rangoDeJornadas(filas))
      setSeleccion(new Set())
      setSentidos(new Map())
      setTurnos(new Map())
      setHoras(new Map())
    } catch (e) {
      setErrorArchivo(`No se pudo leer Jornadas Incompletas: ${e.message}`)
    }
  }

  const cargarFallidas = async (file) => {
    if (!file) return
    setErrorArchivo(null)
    setResultado(null)
    setOperacion(null)
    try {
      setFallidas(filtrarYOrdenar(await leerPlanilla(file)))
      setFallidasCargadas(true)
    } catch (e) {
      setErrorArchivo(`No se pudo leer Marcas Fallidas: ${e.message}`)
    }
  }

  const aEnviar = visibles.filter((r) => seleccion.has(r.id) && utilizable(r))
  const movEfectivo = mov === 'Otro' ? movLibre : mov

  const registrar = async () => {
    if (!obraId || !aEnviar.length) return
    setEnviando(true)
    setError(null)
    setResultado(null)
    try {
      const r = await AsistenciaService.registrarMarcas(
        obraId,
        aEnviar.map((rec) => ({
          rut: rec.rut,
          i: sentidoDe(rec),
          fecha: fechaApiDesdeIso(rec.fecha),
          hora: horaApiDesdeHms(horaDe(rec)),
          mov: movEfectivo,
          record_id: rec.id,
        })),
        operacion
      )
      setResultado(r)
      if (!r.dry_run) {
        const ok = new Set(aEnviar.filter((_, i) => r.resultados[i]?.ok).map((rec) => rec.id))
        setSincronizadas((prev) => new Set([...prev, ...ok]))
        setSeleccion((prev) => {
          const n = new Set(prev)
          ok.forEach((id) => n.delete(id))
          return n
        })
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudieron registrar las marcas.')
    } finally {
      setEnviando(false)
    }
  }

  const obra = obras.find((o) => String(o.id) === String(obraId))

  return (
    <div>
      <div className="border border-app-line rounded-lg p-4 mb-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-app-muted">
          Jornadas Incompletas <span className="text-app-ink">(manda: define las filas)</span>
          <input type="file" accept=".xls,.xlsx,.csv" className={`${campo} block mt-1 w-full`}
            onChange={(e) => cargarJornadas(e.target.files?.[0])} />
          {jornadas.length > 0 && (
            <span className="block mt-1 text-xs">
              {jornadas.length} filas · {rango.desde} → {rango.hasta}
            </span>
          )}
        </label>
        <label className="text-sm text-app-muted">
          Marcas Fallidas <span className="text-app-ink">(aporta la hora del intento)</span>
          <input type="file" accept=".xls,.xlsx,.csv" className={`${campo} block mt-1 w-full`}
            onChange={(e) => cargarFallidas(e.target.files?.[0])} />
          {fallidasCargadas && <span className="block mt-1 text-xs">{fallidas.length} intentos</span>}
        </label>
      </div>

      {errorArchivo && <p className="mb-4 text-sm text-red-600">{errorArchivo}</p>}

      {!jornadas.length || !fallidasCargadas ? (
        <p className="px-6 py-10 text-center text-app-muted text-sm">
          Sube ambos archivos para armar las marcas. Si no hay intentos que cruzar, sube igual el
          archivo de Marcas Fallidas vacío: las filas quedan para completar a mano.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="text-sm text-app-muted">
              Motivo
              <select value={mov} onChange={(e) => setMov(e.target.value)} className={`${campo} block mt-1`}>
                {MOVS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            {mov === 'Otro' && (
              <input value={movLibre} onChange={(e) => setMovLibre(e.target.value)}
                placeholder="Motivo" className={campo} />
            )}
            <button className={boton} onClick={() => alternarHoja(true)}>Seleccionar hoja</button>
            <button className={boton} onClick={() => alternarHoja(false)}>Quitar hoja</button>
            <button className={boton} onClick={descartarManuales}
              title="Deja fuera las filas que no cruzaron con ningún intento">
              Descartar los manuales
            </button>
            <button
              onClick={registrar}
              disabled={!obraId || !aEnviar.length || enviando}
              title={obraId ? '' : 'Selecciona una obra'}
              className="ml-auto px-4 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40"
            >
              {enviando ? 'Registrando…' : `Registrar ${aEnviar.length} marcas${obra ? ` en ${obra.nombre}` : ''}`}
            </button>
          </div>

          {resultado && (
            <div className="mb-4 text-sm">
              {resultado.dry_run ? (
                <p className="text-app-muted">
                  Modo de prueba: no se envió nada a Buk. El payload de las{' '}
                  {resultado.resultados.length} marcas quedó en el log del servidor.
                </p>
              ) : (
                <p className="text-app-ink">
                  {resultado.enviadas} marcas registradas
                  {resultado.fallidas > 0 && `, ${resultado.fallidas} fallidas`}.
                </p>
              )}
              {resultado.resultados.filter((r) => !r.ok).map((r, i) => (
                <p key={i} className="text-red-600">{r.rut} {r.fecha}: {r.detail}</p>
              ))}
            </div>
          )}
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          <div className="border border-app-line rounded-xl overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-app-surface text-xs uppercase text-app-muted">
                <tr>
                  <th className="px-3 py-2" />
                  {['RUT', 'Nombre', 'Fecha', 'Hora', 'Turno', 'Sentido', 'Origen'].map((h) => (
                    <th key={h} className="px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-app-line">
                {hoja.map((r) => (
                  <tr key={r.id} className={r.ambiguo ? 'bg-amber-50' : ''}>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={seleccion.has(r.id)}
                        disabled={!utilizable(r)}
                        onChange={(e) => alternarFila(r.id, e.target.checked)}
                        title={utilizable(r) ? '' : 'Falta elegir turno u hora'}
                      />
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.rut}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.nombre}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.fecha}</td>
                    <td className="px-3 py-1.5">
                      {r.matched ? (
                        <span className="whitespace-nowrap">{r.horaIntento}</span>
                      ) : (
                        <input
                          type="time"
                          step="1"
                          value={horaDe(r)}
                          onChange={(e) => setHoras((m) => new Map(m).set(r.id, e.target.value))}
                          className={campo}
                        />
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {r.sinTurno ? (
                        <select
                          value={turnos.get(r.id) ?? ''}
                          onChange={(e) => setTurnos((m) => new Map(m).set(r.id, e.target.value))}
                          className={campo}
                        >
                          <option value="">Elegir turno…</option>
                          {TURNOS_DISPONIBLES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      ) : (
                        <span className="whitespace-nowrap">{r.turnoInicio}-{r.turnoFin}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={sentidoDe(r)}
                        onChange={(e) => setSentidos((m) => new Map(m).set(r.id, e.target.value))}
                        className={campo}
                      >
                        <option value="entrada">entrada</option>
                        <option value="salida">salida</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-app-muted">
                      {r.matched ? 'intento real' : 'manual'}
                      {r.ambiguo && ' · hora ambigua'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-app-muted">
            <span>
              {visibles.length} filas · {aEnviar.length} seleccionadas · hoja {pagina + 1} de {paginas}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPagina((p) => p - 1)} disabled={pagina === 0} className={boton}>
                Anterior
              </button>
              <button onClick={() => setPagina((p) => p + 1)} disabled={pagina >= paginas - 1} className={boton}>
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default MarcasFallidas
