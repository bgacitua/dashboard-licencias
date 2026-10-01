import React, { useCallback, useEffect, useMemo, useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'
import TablaDinamica from './TablaDinamica'
import { descargarCsv } from './exportar'

/**
 * Vino pero no pasó por el torniquete.
 *
 * La persona marcó un reloj de área o una puerta ese día —está acreditado que
 * vino— y aun así no registró ninguna marca en los torniquetes. Que no haya
 * marca de ninguna clase no entra acá: eso es una inasistencia y la persigue la
 * otra pestaña. Los días que Buk explica (licencia, permiso, vacaciones) quedan
 * fuera.
 *
 * El mes no se calcula de una vez porque Morpho no aguanta el rango: se corre
 * semana a semana, se guarda, y el informe mensual lee lo acumulado. Por eso
 * hay dos controles separados —calcular un tramo y ver el mes— en vez de un
 * solo botón.
 */
const COLUMNAS = ['RUT', 'Nombre', 'Jefe', 'Área', 'Recinto', 'Días sin torniquete', 'Fechas']

const iso = (d) => d.toISOString().slice(0, 10)
const hoy = () => iso(new Date())
const haceDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return iso(d)
}
// El día en curso no se calcula (a media jornada nadie "falta" todavía), así
// que el tope de los selectores es ayer. El backend recorta igual.
const ayer = () => haceDias(1)
const mesActual = () => hoy().slice(0, 7)

// Fin de mes sin aritmética de calendario: día 0 del mes siguiente.
const finDeMes = (mes) => {
  const [a, m] = mes.split('-').map(Number)
  return iso(new Date(Date.UTC(a, m, 0)))
}

const dmy = (f) => f.split('-').reverse().join('-')

const input =
  'block mt-1 text-sm border border-app-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-app-ink'

const SinMarca = ({ obraId }) => {
  // Tramo a calcular: por defecto la última semana.
  const [desde, setDesde] = useState(haceDias(7))
  const [hasta, setHasta] = useState(ayer())
  const [mes, setMes] = useState(mesActual())

  const [informe, setInforme] = useState({ filas: [], cobertura: null })
  const [calculando, setCalculando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  const rangoMes = useMemo(() => ({ desde: `${mes}-01`, hasta: finDeMes(mes) }), [mes])

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setInforme(await AsistenciaService.getSinMarca({ ...rangoMes, obraId }))
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo cargar el informe.')
      setInforme({ filas: [], cobertura: null })
    }
  }, [rangoMes, obraId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const calcular = async () => {
    setCalculando(true)
    setError(null)
    setAviso(null)
    try {
      const r = await AsistenciaService.calcularSinMarca({ desde, hasta, obraId })
      setAviso(`Tramo ${dmy(desde)} → ${dmy(hasta)}: ${r.dias} día(s) sin torniquete en ${r.trabajadores} trabajador(es).`)
      // El informe muestra un mes y el tramo puede caer en otro: sin esto lo
      // recién calculado "desaparece" (queda fuera del mes que estaba elegido).
      const mesTramo = desde.slice(0, 7)
      if (mesTramo !== mes) setMes(mesTramo)
      else await cargar()
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo calcular el tramo.')
    } finally {
      setCalculando(false)
    }
  }

  const rows = useMemo(
    () =>
      informe.filas.map((f) => ({
        RUT: f.rut,
        Nombre: f.nombre || '—',
        Jefe: f.jefe || '—',
        'Área': f.area || '—',
        Recinto: f.recinto || '—',
        'Días sin torniquete': f.dias_sin_torniquete,
        Fechas: f.fechas.map(dmy).join(', '),
      })),
    [informe]
  )

  const cob = informe.cobertura
  // Un mes al que le falta una semana se ve igual que un mes limpio: menos
  // filas. El aviso es lo único que distingue "nadie faltó" de "falta correr".
  // El último día exigible del mes: su fin, o ayer si el mes aún está corriendo.
  const ultimoExigible = ayer() < rangoMes.hasta ? ayer() : rangoMes.hasta
  const incompleto = cob && (!cob.hasta_calculado || cob.hasta_calculado < ultimoExigible)

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4 p-3 rounded-2xl border border-app-line/60 bg-app-surface/50">
        <label className="text-sm text-app-muted">
          Calcular desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} max={ayer()} className={input} />
        </label>
        <label className="text-sm text-app-muted">
          hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} max={ayer()} className={input} />
        </label>
        <button
          onClick={calcular}
          disabled={calculando || !desde || !hasta}
          className="px-3 py-1.5 text-sm rounded border border-app-brand/40 text-app-brand hover:bg-white disabled:opacity-40"
        >
          {calculando ? 'Calculando…' : 'Calcular y guardar tramo'}
        </button>
        <p className="text-xs text-app-muted basis-full">
          Máximo 31 días por tramo (límite del reloj). El día en curso no se calcula.
          Recalcular una semana reemplaza lo guardado.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-sm text-app-muted">
          Informe del mes
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={input} />
        </label>
        <button
          onClick={() => descargarCsv(rows, COLUMNAS, `sin_marca_torniquete_${mes}`)}
          disabled={!rows.length}
          className="ml-auto px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40"
        >
          Exportar CSV
        </button>
      </div>

      {aviso && <p className="mb-3 text-sm text-app-brand">{aviso}</p>}
      {cob && (
        <p className={`mb-3 text-sm ${incompleto ? 'text-amber-600' : 'text-app-muted'}`}>
          {cob.hasta_calculado
            ? `Calculado del ${dmy(cob.desde_calculado)} al ${dmy(cob.hasta_calculado)}.`
            : 'Este mes todavía no tiene tramos calculados.'}
          {incompleto && ' Faltan días por calcular: el informe aún no está completo.'}
        </p>
      )}

      <TablaDinamica rows={rows} columns={COLUMNAS} descartados={0} loading={false} error={error} />
    </div>
  )
}

export default SinMarca
