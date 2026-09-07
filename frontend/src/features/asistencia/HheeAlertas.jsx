import React, { useEffect, useMemo, useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'
import TablaDinamica from './TablaDinamica'
import { descargarCsv } from './exportar'

/**
 * Alertas de horas extras aprobadas por sobre el tope.
 *
 * Topes: 2 h diarias, pero solo de lunes a viernes; 12 h por semana ISO. El
 * fin de semana queda acotado únicamente por el tope semanal, así que una
 * semana sin HHEE entre lunes y viernes admite las 12 h completas el sábado y
 * domingo.
 *
 * Los datos NO los produce la plataforma: los escribe el contenedor
 * hhee-scrapping en app.hhee_alertas, de lunes a viernes a las 08:00 sobre la
 * semana anterior. Acá solo se leen, así que si Buk o ese servicio se caen la
 * pantalla sigue viva — de ahí el aviso de frescura, que dice de cuándo es el
 * dato. El botón "Actualizar datos" es lo único que sale a la red.
 */
const COLUMNAS = [
  'recinto', 'rut', 'nombre', 'cargo', 'centro_costo', 'tipo', 'clave_periodo',
  'horas', 'tope', 'exceso', 'veces_vista', 'primera_vez', 'ultima_vez',
]

const select =
  'block mt-1 text-sm border border-app-line rounded px-2 py-1.5 text-app-ink focus:outline-none focus:ring-1 focus:ring-app-ink'

const hace = (iso) => {
  if (!iso) return null
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.round(horas / 24)} d`
}

const HheeAlertas = () => {
  const [semanas, setSemanas] = useState([])
  const [semana, setSemana] = useState('')     // "anio-semana"; vacío = la que decide el backend
  const [tipo, setTipo] = useState('')
  const [recinto, setRecinto] = useState('')
  const [data, setData] = useState(null)
  const [frescura, setFrescura] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refrescando, setRefrescando] = useState(false)
  const [aviso, setAviso] = useState(null)

  const cargar = async () => {
    setLoading(true)
    setError(null)
    const [anioIso, semanaIso] = semana ? semana.split('-') : []
    try {
      const [alertas, fres] = await Promise.all([
        AsistenciaService.getHheeAlertas({ recinto, tipo, anioIso, semanaIso }),
        AsistenciaService.getHheeFrescura(),
      ])
      setData(alertas)
      setFrescura(fres)
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudieron cargar las alertas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    AsistenciaService.getHheeSemanas().then(setSemanas).catch(() => setSemanas([]))
  }, [])

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semana, tipo, recinto])

  const refrescar = async () => {
    setRefrescando(true)
    setAviso(null)
    setError(null)
    try {
      const r = await AsistenciaService.refrescarHhee()
      // El scraper responde 200 aunque un recinto falle: el detalle viene acá.
      const fallidos = (r.recintos || []).filter((x) => x.error)
      setAviso(
        fallidos.length
          ? `${r.ok} de ${r.ok + r.fallidos} recintos actualizados. Falló ${fallidos
              .map((f) => f.recinto)
              .join(', ')}.`
          : `${r.ok} recintos actualizados, ${r.alertas} alertas (${r.desde} a ${r.hasta}).`
      )
      await cargar()
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo actualizar.')
    } finally {
      setRefrescando(false)
    }
  }

  const recintos = useMemo(() => frescura.map((f) => f.recinto), [frescura])
  const masReciente = useMemo(
    () => frescura.map((f) => f.ultima_vez).filter(Boolean).sort().slice(-1)[0],
    [frescura]
  )

  const rows = data?.rows || []

  return (
    <div>
      <div className="bg-app-surface border border-app-line rounded-lg p-4 mb-6 text-sm text-app-muted">
        <p className="mb-1">
          <strong className="text-app-ink">Topes</strong> — 2 h diarias de lunes a viernes, y
          12 h por semana. Sábado y domingo no tienen tope diario: solo los acota el semanal.
        </p>
        <p>
          Los datos se actualizan solos de lunes a viernes a las 08:00, sobre la semana anterior.
          {masReciente && (
            <> Última actualización: <strong className="text-app-ink">{hace(masReciente)}</strong>.</>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="text-sm text-app-muted">
          Semana
          <select className={select} value={semana} onChange={(e) => setSemana(e.target.value)}>
            <option value="">Semana anterior</option>
            {semanas.map((s) => (
              <option key={`${s.anio_iso}-${s.semana_iso}`} value={`${s.anio_iso}-${s.semana_iso}`}>
                {s.anio_iso} · semana {s.semana_iso}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-app-muted">
          Tipo
          <select className={select} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="diario">Diario (&gt; 2 h)</option>
            <option value="semanal">Semanal (&gt; 12 h)</option>
          </select>
        </label>

        <label className="text-sm text-app-muted">
          Recinto
          <select className={select} value={recinto} onChange={(e) => setRecinto(e.target.value)}>
            <option value="">Todos</option>
            {recintos.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>

        <button
          onClick={refrescar}
          disabled={refrescando}
          title="Vuelve a consultar Buk ahora. Tarda ~12 s por recinto."
          className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40"
        >
          {refrescando ? 'Actualizando…' : 'Actualizar datos'}
        </button>

        <button
          onClick={() => descargarCsv(rows, COLUMNAS, 'hhee_alertas')}
          disabled={loading || !rows.length}
          className="ml-auto px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40"
        >
          Exportar CSV
        </button>
      </div>

      {aviso && (
        <div className="mb-4 text-sm text-app-muted border border-app-line rounded p-3">{aviso}</div>
      )}

      <TablaDinamica
        rows={rows}
        columns={data?.columns || COLUMNAS}
        loading={loading}
        error={error}
        vacio="Sin alertas en el período: nadie superó el tope."
      />
    </div>
  )
}

export default HheeAlertas
