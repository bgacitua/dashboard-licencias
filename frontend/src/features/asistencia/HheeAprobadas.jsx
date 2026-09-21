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
 * Dos botones a propósito: "Consultar" lee `app.hhee_historial` (instantáneo,
 * lo que ya se barrió) y "Actualizar desde Buk" manda al scraper a barrer el
 * rango. El scraper solo le pide a Buk el detalle de los registros que
 * cambiaron, así que un periodo ya barrido vuelve en segundos; la primera vez
 * de un rango nuevo son minutos.
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
  const [refrescando, setRefrescando] = useState(false)
  const [resumenSync, setResumenSync] = useState(null)
  const [error, setError] = useState(null)

  const listo = desde && hasta && desde <= hasta
  const ocupado = cargando || refrescando

  const consultar = async () => {
    setCargando(true)
    setError(null)
    try {
      const r = await AsistenciaService.getHheeHistorial({ desde, hasta, recinto, rut })
      setData(r)
      return r
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo leer el reporte.')
      return null
    } finally {
      setCargando(false)
    }
  }

  // Barrer y releer: el POST no devuelve las filas, solo el resumen de lo que
  // le costó (cuántos registros se le pidieron a Buk y cuántos se reusaron).
  const refrescar = async () => {
    setRefrescando(true)
    setError(null)
    setResumenSync(null)
    try {
      setResumenSync(
        await AsistenciaService.refrescarHheeHistorial({ desde, hasta, recinto, rut })
      )
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo actualizar desde Buk.')
      return
    } finally {
      setRefrescando(false)
    }
    await consultar()
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
          <strong className="text-app-ink">Consultar</strong> lee lo ya guardado y es
          instantáneo. <strong className="text-app-ink">Actualizar desde Buk</strong> barre el
          periodo: solo pide el detalle de los registros que cambiaron, así que un rango ya
          consultado vuelve en segundos y uno nuevo puede tardar varios minutos.
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

        <button onClick={consultar} disabled={!listo || ocupado}
                className="px-4 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40">
          {cargando ? 'Consultando…' : 'Consultar'}
        </button>

        <button onClick={refrescar} disabled={!listo || ocupado}
                title="Trae de Buk lo que cambió en el periodo y lo guarda."
                className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40">
          {refrescando ? 'Actualizando desde Buk…' : 'Actualizar desde Buk'}
        </button>

        <button onClick={exportar}
                title="Exporta el detalle completo: una fila por cambio de estado."
                disabled={ocupado || !rows.length}
                className="ml-auto px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40">
          Exportar XLSX
        </button>
      </div>

      {resumenSync && (
        <div className="mb-4 text-sm text-app-muted">
          Actualizado: {resumenSync.registros_listado} registros en el periodo ·{' '}
          {resumenSync.registros_consultados} consultados a Buk ·{' '}
          {resumenSync.registros_reusados} reusados de lo ya guardado.
          {!resumenSync.persistido && (
            <strong className="text-app-ink"> No se pudo guardar: la próxima vez se vuelve
            a bajar todo.</strong>
          )}
        </div>
      )}

      {!!rows.length && (
        <div className="mb-4 text-sm text-app-muted">
          {resumen.length} grupos · {rows.length} filas de detalle ·{' '}
          <strong className="text-app-ink">{totalHoras.toFixed(2)} h</strong> aprobadas en total.
          Exporta el XLSX para el detalle.
        </div>
      )}

      <TablaDinamica
        rows={resumen}
        columns={COLUMNAS_RESUMEN}
        loading={ocupado}
        error={error}
        vacio={listo
          ? 'Sin datos guardados para el periodo. Consulta, y si sigue vacío, actualiza desde Buk.'
          : 'Elige el periodo de fechas.'}
      />
    </div>
  )
}

export default HheeAprobadas
