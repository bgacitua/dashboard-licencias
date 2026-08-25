import React, { useState } from 'react'

import { MOTIVOS, motivoPorDefecto } from './correccion'
import ResultadoMarcas from './ResultadoMarcas'

/**
 * Confirmación del registro de marcas.
 *
 * Escribe en Buk y no se puede deshacer desde acá, así que primero se muestra la
 * lista exacta —RUT, sentido, fecha y hora— y el envío va en un segundo click.
 * Las marcas cuya hora viene de un intento real se marcan para distinguirlas de
 * las que usan la hora del turno.
 *
 * El motivo que va a Buk sale de eso mismo: con intento la marca existía y se
 * corrige su sentido; sin intento el colaborador olvidó marcar. Se puede pisar
 * para todas o fila por fila.
 */
const EnviarMarcas = ({ marcas, obra, obraId, enviando, onEnviar }) => {
  const [abierto, setAbierto] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(null)
  // null = cada fila usa su propio default, que es lo habitual.
  const [motivoGlobal, setMotivoGlobal] = useState(null)
  const [motivoLibre, setMotivoLibre] = useState('')
  const [motivos, setMotivos] = useState(new Map())

  const motivoDe = (marca, i) =>
    motivos.get(i) ??
    (motivoGlobal === 'Otro' ? motivoLibre : motivoGlobal) ??
    motivoPorDefecto(marca)

  const enviar = async () => {
    setError(null)
    try {
      setResultado(await onEnviar(marcas.map((m, i) => ({ ...m, mov: motivoDe(m, i) }))))
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudieron registrar las marcas.')
    }
  }

  const cerrar = () => {
    setAbierto(false)
    setResultado(null)
    setError(null)
    setMotivos(new Map())
    setMotivoGlobal(null)
  }

  const titulo = !obraId
    ? 'Selecciona una obra para poder registrar'
    : 'Revisa las marcas antes de registrarlas'

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        disabled={!obraId || !marcas.length}
        title={titulo}
        className="px-3 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40"
      >
        Registrar marcas{marcas.length ? ` (${marcas.length})` : ''}
      </button>

      {abierto && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => !enviando && cerrar()}
        >
          <div
            className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Registrar marcas"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-app-line">
              <h2 className="text-lg font-semibold text-app-ink">Registrar marcas</h2>
              <p className="text-sm text-app-muted mt-1">
                {marcas.length} marcas en {obra?.nombre || `la obra ${obraId}`}. Se registran en Buk
                y no se pueden deshacer desde acá.
              </p>
            </div>

            {!resultado && (
              <div className="px-6 pt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm text-app-muted">
                  Motivo para todas
                  <select
                    value={motivoGlobal ?? ''}
                    onChange={(e) => setMotivoGlobal(e.target.value || null)}
                    className="block mt-1 text-sm border border-app-line rounded px-2 py-1"
                  >
                    <option value="">Según tenga intento o no</option>
                    {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
                {motivoGlobal === 'Otro' && (
                  <input
                    value={motivoLibre}
                    onChange={(e) => setMotivoLibre(e.target.value)}
                    placeholder="Motivo"
                    className="text-sm border border-app-line rounded px-2 py-1"
                  />
                )}
              </div>
            )}

            <div className="overflow-y-auto px-6 py-4 flex-1 min-h-0">
              {resultado ? (
                <ResultadoMarcas resultado={resultado} />
              ) : (
                // Scroll horizontal propio: el modal no debe empujar la página
                // cuando la tabla no cabe.
                <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-sm min-w-[54rem]">
                  <thead className="text-left text-app-muted sticky top-0 bg-white">
                    <tr>
                      {['RUT', 'Nombre', 'Turno', 'Marca', 'Fecha', 'Hora', 'Origen', 'Motivo'].map((h) => (
                        <th key={h} className="pb-2 pr-4 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {marcas.map((m, i) => (
                      <tr key={`${m.rut}-${m.i}-${m.fecha}-${i}`} className="border-t border-app-line">
                        <td className="py-2 pr-4 whitespace-nowrap">{m.rut}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{m.nombre}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{m.turno}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{m.i}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{m.fecha}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{m.hora}</td>
                        <td className="py-2 pr-4 whitespace-nowrap text-app-muted">
                          {m.matched ? 'intento real' : 'hora del turno'}
                        </td>
                        <td className="py-2">
                          <select
                            value={motivoDe(m, i)}
                            onChange={(e) =>
                              setMotivos((prev) => new Map(prev).set(i, e.target.value))
                            }
                            className="text-sm border border-app-line rounded px-2 py-1 w-full"
                          >
                            {[...new Set([...MOTIVOS.filter((x) => x !== 'Otro'), motivoDe(m, i)])].map(
                              (op) => <option key={op}>{op}</option>
                            )}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-app-line flex gap-3">
              {!resultado && (
                <button
                  onClick={enviar}
                  disabled={enviando}
                  className="px-4 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40"
                >
                  {enviando ? 'Registrando…' : `Registrar ${marcas.length} marcas`}
                </button>
              )}
              <button
                onClick={cerrar}
                disabled={enviando}
                className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40"
              >
                {resultado ? 'Cerrar' : 'Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default EnviarMarcas
