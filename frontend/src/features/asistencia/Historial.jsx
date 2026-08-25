import React, { useCallback, useEffect, useState } from 'react'

import AsistenciaService from '../../services/asistencia.service'
import TablaDinamica from './TablaDinamica'
import { descargarCsv } from './exportar'

/**
 * Historial de marcas enviadas a Buk.
 *
 * Buk no deja consultar qué mandó este módulo ni deshacerlo, así que esta tabla
 * es el único registro de qué se escribió. Incluye lo que falló, con el error.
 */
const COLUMNAS = ['ts', 'obra_id', 'rut', 'sentido', 'fecha', 'hora', 'mov', 'ok', 'detail']

const Historial = ({ desde, hasta }) => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await AsistenciaService.getHistorial({ desde, hasta })
      setRows(data.map((r) => ({ ...r, ok: r.ok ? 'Sí' : 'No' })))
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudo cargar el historial.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-app-muted">
          Marcas enviadas a Buk desde la plataforma, incluidas las que fallaron. La fecha del
          filtro es la del envío, no la de la marca.
        </p>
        <button
          onClick={() => descargarCsv(rows, COLUMNAS, 'historial')}
          disabled={!rows.length}
          className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40"
        >
          Exportar CSV
        </button>
      </div>

      <TablaDinamica
        rows={rows}
        columns={COLUMNAS}
        loading={loading}
        error={error}
        vacio="No hay marcas registradas en este rango."
      />
    </div>
  )
}

export default Historial
