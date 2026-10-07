import React, { useCallback, useEffect, useMemo, useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'
import TablaDinamica from './TablaDinamica'
import { descargarCsv } from './exportar'

/**
 * Presencialidad: días exigibles sin marca de torniquete.
 *
 * Dos grupos, dos definiciones de "día exigible", y por eso dos sub-pestañas con
 * sus propias tablas y exportables en vez de una tabla mezclada:
 *
 *   Con turno — Buk registró la entrada ese día (la persona vino) y Morpho no
 *   tiene ninguna marca suya. Sin marca en Buk no entra: eso es una
 *   inasistencia y la persigue su propia pestaña.
 *
 *   No sujetos a marca — gerencias y KAM, que no tienen turno ni marcan en Buk.
 *   El día exigible es el hábil no feriado, y lo único que puede acreditarlos es
 *   el torniquete.
 *
 * En los dos casos los días que Buk explica (licencia, permiso, vacaciones)
 * quedan fuera.
 *
 * El mes no se calcula de una vez porque Morpho no aguanta el rango: se corre
 * semana a semana, se guarda, y el informe mensual lee lo acumulado. Por eso
 * hay dos controles separados —calcular un tramo y ver el mes— en vez de un
 * solo botón.
 */
const GRUPOS = [
  {
    id: 'turno',
    label: 'Con turno',
    archivo: 'reporte_presencialidad',
    // El denominador útil es distinto en cada grupo: acá los días que vino.
    ayuda: 'Vino según Buk Asistencia y no hay ninguna marca suya en el torniquete.',
  },
  {
    id: 'nomina',
    label: 'No sujetos a marca',
    archivo: 'reporte_presencialidad_nomina',
    ayuda:
      'Gerencias y KAM (rh.employees.name_role). Sin turno ni marca en Buk: ' +
      'se exigen los días hábiles no feriados.',
  },
]

const COLUMNAS = ['RUT', 'Nombre', 'Cargo', 'Jefe', 'Área', 'Recinto', 'Días sin torniquete', 'Fechas']

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

const Informe = ({ obraId, grupo }) => {
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
      setInforme(await AsistenciaService.getPresencialidad({ ...rangoMes, obraId, grupo: grupo.id }))
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo cargar el informe.')
      setInforme({ filas: [], cobertura: null })
    }
  }, [rangoMes, obraId, grupo])

  useEffect(() => {
    cargar()
  }, [cargar])

  const calcular = async () => {
    setCalculando(true)
    setError(null)
    setAviso(null)
    try {
      const r = await AsistenciaService.calcularPresencialidad({
        desde, hasta, obraId, grupo: grupo.id,
      })
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
        Cargo: f.cargo || '—',
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
      <p className="mb-3 text-sm text-app-muted">{grupo.ayuda}</p>

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
          className="px-3 py-1.5 text-sm rounded text-app-brand hover:bg-app-surface transition-colors disabled:opacity-40"
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
          onClick={() => descargarCsv(rows, COLUMNAS, `${grupo.archivo}_${mes}`)}
          disabled={!rows.length}
          className="ml-auto px-3 py-1.5 text-sm rounded text-app-ink hover:bg-app-surface transition-colors disabled:opacity-40"
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

/**
 * Las dos sub-pestañas. Se montan por separado (no `hidden`) a propósito: cada
 * una tiene su propio tramo guardado y su propio informe, y mantener las dos
 * cargadas sería pedir dos veces lo mismo al entrar.
 */
const Presencialidad = ({ obraId }) => {
  const [grupoId, setGrupoId] = useState(GRUPOS[0].id)
  const grupo = GRUPOS.find((g) => g.id === grupoId)

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5 p-2 rounded-2xl border border-app-line/60
                      bg-app-surface/50 backdrop-blur-md">
        {GRUPOS.map((g) => (
          <button
            key={g.id}
            onClick={() => setGrupoId(g.id)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              grupoId === g.id
                ? 'text-app-brand bg-white/80'
                : 'text-app-muted hover:text-app-ink hover:bg-white/50'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <Informe key={grupo.id} obraId={obraId} grupo={grupo} />
    </div>
  )
}

export default Presencialidad
