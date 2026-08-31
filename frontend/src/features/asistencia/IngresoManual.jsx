import React, { useState } from 'react'

import AsistenciaService from '../../services/asistencia.service'
import ResultadoMarcas from './ResultadoMarcas'
import {
  COLUMNAS_MANUAL,
  descargarTemplateManual,
  fechaApiDesdeIso,
  horaApiDesdeHms,
  leerIngresoManual,
  leerPlanilla,
  normalizarFecha,
  normalizarHora,
  proximoId,
} from './correccion'

/**
 * Ingreso manual: marcas que no salen de ningún archivo del sistema.
 *
 * Para los casos que las otras pestañas no cubren — un turno que no estaba
 * asignado, una marca de un día viejo. Se escriben a mano o se suben en una
 * planilla, se revisan en la tabla y recién ahí se registran.
 */

const MOVS = ['Ingreso Manual', 'Corrección Sentido Marca', 'Otro']

const boton = 'px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40'
const campo = 'text-sm border border-app-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-app-ink'

const VACIO = { rut: '', fecha: '', hora: '', sentido: 'entrada' }

const IngresoManual = ({ obraId, obras }) => {
  const [registros, setRegistros] = useState([])
  const [seleccion, setSeleccion] = useState(new Set())
  const [form, setForm] = useState(VACIO)
  const [errores, setErrores] = useState([])
  const [mov, setMov] = useState(MOVS[0])
  const [movLibre, setMovLibre] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(null)

  const agregar = () => {
    if (!form.rut.trim() || !form.fecha || !form.hora) return
    const registro = {
      id: proximoId(),
      rut: form.rut.trim(),
      fecha: normalizarFecha(form.fecha),
      hora: normalizarHora(form.hora),
      sentido: form.sentido,
    }
    setRegistros((r) => [...r, registro])
    setSeleccion((s) => new Set([...s, registro.id]))
    setForm({ ...VACIO, fecha: form.fecha, sentido: form.sentido })
  }

  const importar = async (file) => {
    if (!file) return
    setErrores([])
    try {
      const { records, errors } = leerIngresoManual(await leerPlanilla(file))
      setRegistros((r) => [...r, ...records])
      setSeleccion((s) => new Set([...s, ...records.map((x) => x.id)]))
      setErrores(errors)
    } catch (e) {
      setErrores([`No se pudo leer el archivo: ${e.message}`])
    }
  }

  const editar = (id, patch) =>
    setRegistros((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const quitar = (id) => {
    setRegistros((rs) => rs.filter((r) => r.id !== id))
    setSeleccion((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
  }

  const alternar = (id, marcar) =>
    setSeleccion((s) => {
      const n = new Set(s)
      if (marcar) n.add(id)
      else n.delete(id)
      return n
    })

  const completo = (r) => r.rut && r.fecha && r.hora
  const aEnviar = registros.filter((r) => seleccion.has(r.id) && completo(r))
  const movEfectivo = mov === 'Otro' ? movLibre : mov
  const obra = obras.find((o) => String(o.id) === String(obraId))

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
          i: rec.sentido,
          fecha: fechaApiDesdeIso(rec.fecha),
          hora: horaApiDesdeHms(rec.hora),
          mov: movEfectivo,
        }))
      )
      setResultado(r)
      if (!r.dry_run) {
        const ok = new Set(aEnviar.filter((_, i) => r.resultados[i]?.ok).map((rec) => rec.id))
        setRegistros((rs) => rs.filter((rec) => !ok.has(rec.id)))
        setSeleccion((s) => {
          const n = new Set(s)
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

  return (
    <div>
      {/* Fuera del bloque de la tabla: al registrar bien se vacían los registros,
          y el aviso tiene que seguir en pantalla igual. */}
      <ResultadoMarcas resultado={resultado} className="mb-4" />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="border border-app-line rounded-lg p-4 mb-4">
        <p className="text-sm text-app-ink font-medium mb-3">Agregar una marca</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-app-muted">
            RUT
            <input value={form.rut} onChange={(e) => setForm({ ...form, rut: e.target.value })}
              placeholder="26.258.345-7" className={`${campo} block mt-1`} />
          </label>
          <label className="text-sm text-app-muted">
            Fecha
            <input type="date" value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className={`${campo} block mt-1`} />
          </label>
          <label className="text-sm text-app-muted">
            Hora
            <input type="time" step="1" value={form.hora}
              onChange={(e) => setForm({ ...form, hora: e.target.value })}
              className={`${campo} block mt-1`} />
          </label>
          <label className="text-sm text-app-muted">
            Sentido
            <select value={form.sentido} onChange={(e) => setForm({ ...form, sentido: e.target.value })}
              className={`${campo} block mt-1`}>
              <option value="entrada">entrada</option>
              <option value="salida">salida</option>
            </select>
          </label>
          <button onClick={agregar} disabled={!form.rut.trim() || !form.fecha || !form.hora}
            className={boton}>
            Agregar
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 mt-4 pt-4 border-t border-app-line">
          <label className="text-sm text-app-muted">
            …o importar una planilla ({COLUMNAS_MANUAL.join(' · ')})
            <input type="file" accept=".xls,.xlsx,.csv" className={`${campo} block mt-1`}
              onChange={(e) => importar(e.target.files?.[0])} />
          </label>
          <button className={boton} onClick={descargarTemplateManual}>Descargar template</button>
        </div>

        {errores.length > 0 && (
          <div className="mt-3 px-3 py-2 text-sm border rounded bg-amber-50 text-amber-800 border-amber-200">
            {errores.map((e, i) => <p key={i}>⚠ {e}</p>)}
          </div>
        )}
      </div>

      {registros.length > 0 && (
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
            <button
              onClick={registrar}
              disabled={!obraId || !aEnviar.length || enviando}
              title={obraId ? '' : 'Selecciona una obra'}
              className="ml-auto px-4 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40"
            >
              {enviando ? 'Registrando…' : `Registrar ${aEnviar.length} marcas${obra ? ` en ${obra.nombre}` : ''}`}
            </button>
          </div>

          <div className="border border-app-line rounded-xl overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-app-surface text-xs uppercase text-app-muted">
                <tr>
                  <th className="px-3 py-2" />
                  {['RUT', 'Fecha', 'Hora', 'Sentido', ''].map((h, i) => (
                    <th key={i} className="px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-app-line">
                {registros.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-1.5">
                      <input type="checkbox" checked={seleccion.has(r.id)} disabled={!completo(r)}
                        onChange={(e) => alternar(r.id, e.target.checked)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input value={r.rut} onChange={(e) => editar(r.id, { rut: e.target.value })}
                        className={campo} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="date" value={r.fecha}
                        onChange={(e) => editar(r.id, { fecha: e.target.value })} className={campo} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="time" step="1" value={r.hora}
                        onChange={(e) => editar(r.id, { hora: e.target.value })} className={campo} />
                    </td>
                    <td className="px-3 py-1.5">
                      <select value={r.sentido} onChange={(e) => editar(r.id, { sentido: e.target.value })}
                        className={campo}>
                        <option value="entrada">entrada</option>
                        <option value="salida">salida</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => quitar(r.id)} className="text-app-muted hover:text-red-600"
                        title="Quitar de la lista">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default IngresoManual
