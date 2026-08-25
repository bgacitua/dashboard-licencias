import React, { useState } from 'react'

import { descargarBonoEspecial } from './bonoEspecial'
import { prepararColMov, prepararContratista } from './bonosAdicionales'

/**
 * Las tres descargas de bono que salen del dataset de Marcajes.
 *
 * Cada una tiene su propio periodo y por eso no reusan el rango del tab:
 *   Bono especial          — usa el rango consultado, para anclar semanas partidas.
 *   Colación y movilización — quincena a quincena, se elige acá.
 *   Bono contratista        — mes calendario completo.
 *
 * Los dos últimos avisan si el rango del tab no cubre el periodo pedido: el
 * cálculo corre sobre las filas cargadas, así que un rango corto produce un
 * archivo incompleto sin ninguna señal.
 */
const boton = 'px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40'
const campo = 'text-sm border border-app-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-app-ink'

/** Panel desplegable sobre <details>: el navegador ya maneja abrir y cerrar. */
const Desplegable = ({ label, disabled, children }) => (
  <details className="relative">
    <summary className={`${boton} list-none select-none ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}>
      {label}
    </summary>
    <div className="absolute right-0 z-20 mt-2 p-4 bg-white border border-app-line rounded-lg shadow-lg min-w-64 space-y-3">
      {children}
    </div>
  </details>
)

const DescargasBonos = ({ rows, desde, hasta }) => {
  const [periodo, setPeriodo] = useState({ desde: '', hasta: '' })
  const [mes, setMes] = useState('')
  const [aviso, setAviso] = useState(null)

  const sinDatos = !rows.length

  const bajar = (preparado) => {
    if (!preparado.ok) {
      setAviso({ tipo: 'error', msg: preparado.mensaje })
      return
    }
    if (preparado.confirmar && !window.confirm(
      `El periodo pedido no está cubierto por lo consultado: ${preparado.confirmar}.\n¿Descargar igual?`
    )) return
    preparado.descargar()
    setAviso(null)
  }

  const especial = () => {
    const r = descargarBonoEspecial(rows, { desde, hasta })
    setAviso(r.ok ? null : { tipo: 'error', msg: r.mensaje })
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      <button onClick={especial} disabled={sinDatos} className={boton}
        title="Turno nocturno, sobre el rango consultado">
        Bono especial
      </button>

      <Desplegable label="Colación y Movilización" disabled={sinDatos}>
        <p className="text-xs text-app-muted">
          Fines de semana trabajados. Periodo libre, normalmente de quincena a quincena.
        </p>
        <label className="block text-sm text-app-muted">
          Desde
          <input type="date" value={periodo.desde} className={`${campo} block mt-1 w-full`}
            onChange={(e) => setPeriodo({ ...periodo, desde: e.target.value })} />
        </label>
        <label className="block text-sm text-app-muted">
          Hasta
          <input type="date" value={periodo.hasta} className={`${campo} block mt-1 w-full`}
            onChange={(e) => setPeriodo({ ...periodo, hasta: e.target.value })} />
        </label>
        <button
          onClick={() => bajar(prepararColMov(rows, periodo))}
          disabled={!periodo.desde || !periodo.hasta || periodo.desde > periodo.hasta}
          className="w-full px-3 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40"
        >
          Descargar
        </button>
      </Desplegable>

      <Desplegable label="Bono Contratista" disabled={sinDatos}>
        <p className="text-xs text-app-muted">
          Mes calendario completo. Se paga al mes siguiente del trabajado.
        </p>
        <label className="block text-sm text-app-muted">
          Mes trabajado
          <input type="month" value={mes} className={`${campo} block mt-1 w-full`}
            onChange={(e) => setMes(e.target.value)} />
        </label>
        <button
          onClick={() => bajar(prepararContratista(rows, mes))}
          disabled={!mes}
          className="w-full px-3 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40"
        >
          Descargar
        </button>
      </Desplegable>

      {aviso && (
        <p className="w-full text-sm text-amber-700">⚠ {aviso.msg}</p>
      )}
    </div>
  )
}

export default DescargasBonos
