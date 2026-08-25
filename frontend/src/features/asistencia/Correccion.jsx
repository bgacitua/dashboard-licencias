import React, { useState } from 'react'
import AsistenciaService from '../../services/asistencia.service'
import { aPayload, construirMarcas } from './marcas'

/**
 * Corrección de inasistencias: registra en Buk las marcas que faltan.
 *
 * La hora sale del turno asignado y qué marca falta lo dice Marcajes, así que
 * ambas fuentes se piden recién al preparar, no en cada carga de la tabla.
 *
 * Escribe en el sistema real y no hay forma de deshacerlo desde acá: primero se
 * muestra la lista exacta y el envío va en un segundo click. Si el servidor
 * tiene ASISTENCIA_DRY_RUN encendido, la respuesta avisa que no se envió nada.
 */
const Correccion = ({ inasistencias, desde, hasta, obraId, obras, onRegistrado }) => {
  const [marcas, setMarcas] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)

  const obra = obras.find((o) => String(o.id) === String(obraId))

  const preparar = async () => {
    setOcupado(true)
    setError(null)
    setResultado(null)
    try {
      const rango = { desde, hasta, obraId }
      const [turnos, previas] = await Promise.all([
        AsistenciaService.getVista('asignacion-turnos', rango),
        AsistenciaService.getVista('marcajes', rango),
      ])
      setMarcas(construirMarcas(inasistencias, turnos.rows, previas.rows))
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudieron cargar los turnos y marcajes.')
    } finally {
      setOcupado(false)
    }
  }

  const registrar = async () => {
    setOcupado(true)
    setError(null)
    try {
      const r = await AsistenciaService.registrarMarcas(obraId, marcas.map(aPayload))
      setResultado(r)
      setMarcas(null)
      onRegistrado?.()
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudieron registrar las marcas.')
    } finally {
      setOcupado(false)
    }
  }

  if (!inasistencias.length) return null

  return (
    <div className="mt-6 border-t border-app-line pt-6">
      <h2 className="text-sm font-semibold text-app-ink mb-1">Corregir inasistencias</h2>
      <p className="text-sm text-app-muted mb-4">
        Registra en Buk las marcas que faltan, con la hora del turno asignado.
        {!obraId && ' Selecciona una obra para habilitarlo.'}
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={preparar}
          disabled={!obraId || ocupado}
          className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40"
        >
          {ocupado && !marcas ? 'Revisando…' : 'Preparar marcas'}
        </button>
        {marcas?.length > 0 && (
          <button
            onClick={registrar}
            disabled={ocupado}
            className="px-3 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40"
          >
            {ocupado ? 'Registrando…' : `Registrar ${marcas.length} marcas en ${obra?.nombre || 'la obra'}`}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {marcas?.length === 0 && (
        <p className="mt-3 text-sm text-app-muted">
          No hay marcas que registrar: las filas ya tienen sus marcas o no tienen turno asignado.
        </p>
      )}

      {marcas?.length > 0 && (
        <div className="mt-4 max-h-72 overflow-auto border border-app-line rounded">
          <table className="w-full text-sm">
            <thead className="bg-app-surface sticky top-0">
              <tr>
                {['RUT', 'Nombre', 'Turno', 'Marca', 'Fecha', 'Hora'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-app-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {marcas.map((m, i) => (
                <tr key={`${m.rut}-${m.i}-${m.fecha}-${i}`} className="border-t border-app-line">
                  <td className="px-3 py-1.5 whitespace-nowrap">{m.rut}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{m.nombre}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{m.turno}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{m.i}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{m.fecha}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{m.hora}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resultado && (
        <div className="mt-4 text-sm">
          {resultado.dry_run ? (
            <p className="text-app-muted">
              Modo de prueba: no se envió nada a Buk. El payload de las {resultado.resultados.length}{' '}
              marcas quedó en el log del servidor. Para registrar de verdad, apaga ASISTENCIA_DRY_RUN.
            </p>
          ) : (
            <p className="text-app-ink">
              {resultado.enviadas} marcas registradas
              {resultado.fallidas > 0 && `, ${resultado.fallidas} fallidas`}.
            </p>
          )}
          {resultado.resultados.filter((r) => !r.ok).map((r, i) => (
            <p key={i} className="text-red-600">{r.rut} {r.fecha}: {r.detail}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export default Correccion
