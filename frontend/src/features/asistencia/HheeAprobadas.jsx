import React, { useMemo, useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'
import TablaDinamica from './TablaDinamica'
import { descargarHojas } from './planilla'
import { COLUMNAS_RESUMEN, resumir } from './hheeResumen'

/**
 * Horas extras aprobadas en un periodo: una fila por cambio de estado, con los
 * datos del trabajador al lado. Es el reporte que antes se generaba a mano con
 * el CLI del scraper y viajaba por correo como XLSX.
 *
 * La tabla muestra un resumen por trabajador × estado × tipo de HHEE: el
 * detalle son varias filas por registro y en un mes son miles, ilegibles en
 * pantalla. El detalle completo sale por el XLSX, que es donde se lo trabaja.
 *
 * No se carga solo al abrir la pestaña, y esa es la diferencia con las alertas:
 * las alertas se leen de `app.hhee_alertas` (instantáneo, dato del job), esto
 * consulta Buk en vivo con un request por registro y tarda minutos en rangos
 * largos. Se pide con un clic y punto.
 */
// Columnas del detalle: solo se usan para el XLSX, no para la tabla.
const COLUMNAS_DETALLE = [
  'recinto', 'registroTiempoId', 'rut', 'nombreTrab', 'nombreEstado',
  'estadoRegistroTiempo', 'inicioPeriodo', 'finPeriodo', 'nombreHHEE',
  'hora', 'hheeAprobadas', 'hheeAprobadasNum', 'valor', 'tipoRegistroTiempo',
  'fecha', 'usuario', 'origen', 'version',
]

const input =
  'block mt-1 text-sm border border-app-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-app-ink'

const HheeAprobadas = () => {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [recinto, setRecinto] = useState('')
  const [rut, setRut] = useState('')
  const [data, setData] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  const listo = desde && hasta && desde <= hasta

  const generar = async () => {
    setCargando(true)
    setError(null)
    try {
      setData(await AsistenciaService.getHheeHistorial({ desde, hasta, recinto, rut }))
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo generar el reporte.')
    } finally {
      setCargando(false)
    }
  }

  const rows = data?.rows || []
  const columnasDetalle = data?.columns?.length ? data.columns : COLUMNAS_DETALLE
  const resumen = useMemo(() => resumir(rows), [rows])
  const totalHoras = rows.reduce((a, r) => a + (Number(r.hheeAprobadasNum) || 0), 0)

  // El recinto sale del dato y no del filtro: con el filtro vacío el scraper
  // usa su recinto por defecto, y el nombre del archivo tiene que decir cuál
  // fue. Mismo formato que el XLSX del CLI, para que convivan en una carpeta.
  const recintoArchivo = [...new Set(rows.map((r) => r.recinto))].join('-') || 'todos'
  const exportar = () =>
    descargarHojas(
      [{ nombre: 'historial', rows, columns: columnasDetalle }],
      `hhee_aprobadas_${recintoArchivo}_${desde}_${hasta}.xlsx`
    )

  return (
    <div>
      <div className="bg-app-surface border border-app-line rounded-lg p-4 mb-6 text-sm text-app-muted">
        <p className="mb-1">
          <strong className="text-app-ink">Horas extras aprobadas</strong> — cantidad de
          registros por trabajador, estado y tipo de HHEE. El detalle (una fila por cambio de
          estado, con quién aprobó y cuándo) sale en el XLSX.
        </p>
        <p>
          Consulta Buk en vivo, no la tabla de alertas: en periodos de un mes puede tardar
          varios minutos. Acotar por recinto o RUT lo hace bastante más rápido.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-sm text-app-muted">
          Desde
          <input type="date" className={input} value={desde}
                 onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="text-sm text-app-muted">
          Hasta
          <input type="date" className={input} value={hasta}
                 onChange={(e) => setHasta(e.target.value)} />
        </label>
        <label className="text-sm text-app-muted">
          Recinto
          <input type="text" placeholder="todos" className={input} value={recinto}
                 onChange={(e) => setRecinto(e.target.value.trim())} />
        </label>
        <label className="text-sm text-app-muted">
          RUT
          <input type="text" placeholder="opcional" className={input} value={rut}
                 onChange={(e) => setRut(e.target.value.trim())} />
        </label>

        <button onClick={generar} disabled={!listo || cargando}
                className="px-4 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40">
          {cargando ? 'Consultando Buk…' : 'Generar'}
        </button>

        <button onClick={exportar}
                title="Exporta el detalle completo: una fila por cambio de estado."
                disabled={cargando || !rows.length}
                className="ml-auto px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40">
          Exportar XLSX
        </button>
      </div>

      {!!rows.length && (
        <div className="mb-4 text-sm text-app-muted">
          {resumen.length} grupos · {rows.length} filas de detalle ·{' '}
          <strong className="text-app-ink">{totalHoras.toFixed(2)} h</strong> aprobadas en total.
          Exportá el XLSX para el detalle.
        </div>
      )}

      <TablaDinamica
        rows={resumen}
        columns={COLUMNAS_RESUMEN}
        loading={cargando}
        error={error}
        vacio={listo ? 'Generá el reporte para ver los resultados.' : 'Elegí el periodo de fechas.'}
      />
    </div>
  )
}

export default HheeAprobadas
