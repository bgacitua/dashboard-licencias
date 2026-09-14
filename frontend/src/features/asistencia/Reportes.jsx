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
// simular_hasta vacío = reporte oficial. Con fecha, el backend proyecta los días
// que faltan y responde otras columnas (ver getSimulacionBono).
const INICIAL = {
  q1_inicio: '', q2_inicio: '', q2_fin: '', valor_bono: 70000,
  simular_hasta: '', olvidos_por_dia: 1,
}

const input =
  'block mt-1 text-sm border border-app-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-app-ink'

const Reportes = () => {
  const [params, setParams] = useState(INICIAL)
  const [atrasos, setAtrasos] = useState([])
  const [archivo, setArchivo] = useState('')
  const [data, setData] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [supuestos, setSupuestos] = useState(null)

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

  const simulando = Boolean(params.simular_hasta)

  const generar = () => correr(async () => {
    if (simulando) {
      const sim = await AsistenciaService.getSimulacionBono(params, atrasos)
      setData(sim)
      setSupuestos(sim.supuestos)
      return
    }
    setSupuestos(null)
    setData(await AsistenciaService.getReporteBono(params, atrasos))
  })

  // El .xlsx de la simulación se arma con lo que ya está en pantalla: no hace
  // falta otra llamada, y la hoja Supuestos viaja pegada a los números para que
  // el archivo no se pueda leer fuera de contexto.
  const descargarSimulacion = () => {
    const filas = Object.entries(supuestos).map(([k, v]) => ({ Supuesto: k, Valor: String(v) }))
    descargarHojas(
      [
        { nombre: `Simulacion al ${supuestos.corte}`, rows: data.rows, columns: data.columns },
        { nombre: 'Supuestos', rows: filas, columns: ['Supuesto', 'Valor'] },
      ],
      `SIMULACION_${supuestos.corte}_bono_asistencia.xlsx`,
    )
  }

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
        <label className="text-sm text-app-muted">
          Simular cierre al
          <input type="date" className={input} value={params.simular_hasta}
                 min={params.q1_inicio || undefined} max={params.q2_fin || undefined}
                 onChange={(e) => set({ simular_hasta: e.target.value })} />
        </label>
        {simulando && (
          <label className="text-sm text-app-muted">
            Supuesto por día pendiente
            <select className={input} value={params.olvidos_por_dia}
                    onChange={(e) => set({ olvidos_por_dia: Number(e.target.value) })}>
              <option value={1}>Olvidan la salida (1 olvido)</option>
              <option value={2}>Olvidan entrada y salida (2 olvidos)</option>
              <option value={0}>No olvidan nada</option>
            </select>
          </label>
        )}
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
          {ocupado ? 'Generando…' : simulando ? 'Simular cierre' : 'Generar'}
        </button>
        <button onClick={() => descargar(false)} disabled={!listo || ocupado || simulando}
                className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40">
          Descargar .xlsx
        </button>
        <button onClick={() => descargar(true)} disabled={!listo || ocupado || simulando}
                className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40">
          Descargar JC_.xlsx
        </button>
        {simulando && (
          <button onClick={descargarSimulacion} disabled={!data || ocupado}
                  className="px-3 py-1.5 text-sm border border-amber-400 text-amber-900 rounded hover:bg-amber-50 disabled:opacity-40">
            Descargar simulación
          </button>
        )}
      </div>

      {simulando && supuestos && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-6 text-sm">
          <p className="font-semibold text-amber-900 mb-2">
            ⚠ SIMULACIÓN — no es el cierre oficial
          </p>
          <ul className="text-amber-900 space-y-1">
            <li>
              Cierre proyectado al <strong>{supuestos.corte}</strong>, asumiendo{' '}
              <strong>{supuestos.olvidos_por_dia}</strong> olvido(s) de marca por día pendiente.
            </li>
            <li>
              Marcajes considerados observables hasta {supuestos.lag_dias} día(s) antes del corte;
              atrasos, solo hasta <strong>{supuestos.atrasos_hasta || 'sin datos'}</strong>
              {supuestos.atrasos_hasta && supuestos.atrasos_hasta < supuestos.corte &&
                ' — el archivo no llega al corte, esos días no se pudieron evaluar'}.
            </li>
            {supuestos.trabajadores_sin_turnos > 0 && (
              <li className="font-semibold">
                {supuestos.trabajadores_sin_turnos} de {supuestos.trabajadores} trabajadores sin
                turnos cargados: aparecen sin días pendientes porque falta el dato, no porque
                tengan el bono asegurado.
              </li>
            )}
            {supuestos.turnos_sin_horario > 0 && (
              <li>{supuestos.turnos_sin_horario} turno(s) con horario ilegible, asumidos diurnos.</li>
            )}
          </ul>
        </div>
      )}

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
