import React, { useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'
import TablaDinamica from './TablaDinamica'
import { COLUMNAS_ATRASOS, descargarHojas, descargarTemplateAtrasos, leerAtrasos } from './planilla'

/**
 * Reporte de bono de asistencia por quincena.
 *
 * Las quincenas se piden explícitas porque los cortes cambian mes a mes.
 * El archivo de atrasos es obligatorio: sin él los Atrasos quedan en 0 y los
 * bonos salen inflados, que es peor que no generar el reporte.
 */
const INICIAL = { q1_inicio: '', q2_inicio: '', q2_fin: '', valor_bono: 70000 }

const input =
  'block mt-1 text-sm border border-app-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-app-ink'

const Reportes = () => {
  const [params, setParams] = useState(INICIAL)
  const [atrasos, setAtrasos] = useState([])
  const [archivo, setArchivo] = useState('')
  const [data, setData] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  const set = (patch) => setParams((p) => ({ ...p, ...patch }))
  const listo = params.q1_inicio && params.q2_inicio && params.q2_fin && atrasos.length > 0

  const cargarArchivo = async (file) => {
    setError(null)
    if (!file) {
      setAtrasos([])
      setArchivo('')
      return
    }
    try {
      const filas = await leerAtrasos(file)
      setAtrasos(filas)
      setArchivo(`${file.name} — ${filas.length} filas`)
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e.message}`)
      setAtrasos([])
      setArchivo('')
    }
  }

  const correr = async (fn) => {
    setOcupado(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo generar el reporte.')
    } finally {
      setOcupado(false)
    }
  }

  const generar = () => correr(async () => setData(await AsistenciaService.getReporteBono(params, atrasos)))

  const descargar = (jc) =>
    correr(async () => {
      const hojas = await AsistenciaService.getReporteBonoHojas(params, atrasos, jc)
      descargarHojas(hojas, `${jc ? 'JC_' : ''}bono_asistencia.xlsx`)
    })

  return (
    <div>
      <div className="bg-app-surface border border-app-line rounded-lg p-4 mb-6 text-sm text-app-muted">
        <p className="mb-2">
          <strong className="text-app-ink">Reporte de atrasos</strong> — obligatorio. Sin él los
          atrasos quedan en cero y los bonos salen inflados.
        </p>
        <p>
          Columnas esperadas: <code>{COLUMNAS_ATRASOS.join(' · ')}</code>. Acepta xls, xlsx y csv.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-sm text-app-muted">
          Inicio Quincena 1
          <input type="date" className={input} value={params.q1_inicio}
                 onChange={(e) => set({ q1_inicio: e.target.value })} />
        </label>
        <label className="text-sm text-app-muted">
          Inicio Quincena 2 (corte)
          <input type="date" className={input} value={params.q2_inicio}
                 onChange={(e) => set({ q2_inicio: e.target.value })} />
        </label>
        <label className="text-sm text-app-muted">
          Fin Quincena 2
          <input type="date" className={input} value={params.q2_fin}
                 onChange={(e) => set({ q2_fin: e.target.value })} />
        </label>
        <label className="text-sm text-app-muted">
          Valor bono
          <input type="number" className={input} value={params.valor_bono}
                 onChange={(e) => set({ valor_bono: Number(e.target.value) })} />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-sm text-app-muted">
          Archivo de atrasos
          <input type="file" accept=".xls,.xlsx,.csv" className={`${input} py-1`}
                 onChange={(e) => cargarArchivo(e.target.files?.[0])} />
        </label>
        <button onClick={descargarTemplateAtrasos}
                className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface">
          Descargar template
        </button>
        {archivo && <span className="text-sm text-app-muted pb-2">{archivo}</span>}
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={generar} disabled={!listo || ocupado}
                className="px-4 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40">
          {ocupado ? 'Generando…' : 'Generar'}
        </button>
        <button onClick={() => descargar(false)} disabled={!listo || ocupado}
                className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40">
          Descargar .xlsx
        </button>
        <button onClick={() => descargar(true)} disabled={!listo || ocupado}
                className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40">
          Descargar JC_.xlsx
        </button>
      </div>

      <TablaDinamica
        rows={data?.rows || []}
        columns={data?.columns || []}
        loading={ocupado && !data}
        error={error}
        vacio={listo ? 'Genera el reporte para ver los resultados.' : 'Completa las quincenas y sube el reporte de atrasos.'}
      />
    </div>
  )
}

export default Reportes
