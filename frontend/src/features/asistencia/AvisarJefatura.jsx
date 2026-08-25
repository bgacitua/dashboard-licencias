import React, { useEffect, useMemo, useState } from 'react'

import AsistenciaService from '../../services/asistencia.service'
import { fechaIso, limpiarRut } from './marcas'
import { descargarPreview } from './previewCorreo'

/**
 * Aviso a jefatura de las inasistencias seleccionadas.
 *
 * Se manda un correo por trabajador con todas sus fechas juntas, no uno por
 * fila. El correo lleva un link a un formulario donde la jefatura elige el
 * motivo de cada fecha; la respuesta vuelve como columna en la tabla.
 *
 * Con ASISTENCIA_DRY_RUN no sale ningún correo, pero los avisos igual se crean:
 * queda una vista previa descargable y los formularios funcionan de verdad.
 * Sin dry-run manda correo real, así que primero se muestra quién lo recibe.
 */

/** Nombre legible: los campos cambian según la fuente de la fila. */
const nombreDe = (r) =>
  [r.nombre, r.apellidoPaterno ?? r.apellido_paterno, r.apellidoMaterno ?? r.apellido_materno]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(' ')

/** Un aviso por trabajador, con sus fechas ordenadas y sin repetir. */
export function avisosDe(rows, jefatura) {
  const porRut = new Map()
  for (const r of rows) {
    const rut = limpiarRut(r.DNI ?? r.dni ?? '')
    const aviso = porRut.get(rut) ?? { rut, nombre: nombreDe(r), jefatura, fechas: [] }
    const fecha = fechaIso(r)
    if (!aviso.fechas.includes(fecha)) aviso.fechas.push(fecha)
    porRut.set(rut, aviso)
  }
  return [...porRut.values()].map((a) => ({ ...a, fechas: a.fechas.sort() }))
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const AvisarJefatura = ({ rows, obraId, obra, desde, hasta, onEnviado }) => {
  const [abierto, setAbierto] = useState(false)
  // La jefatura se escribe y se recuerda: hoy no hay una jefatura por obra en Buk.
  const [jefatura, setJefatura] = useState(() => {
    try {
      return localStorage.getItem('asistencia_jefatura') ?? ''
    } catch {
      return ''
    }
  })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)
  // El botón no puede decir "enviar" si el servidor está en modo de prueba.
  const [dryRun, setDryRun] = useState(null)

  useEffect(() => {
    if (!abierto || dryRun !== null) return
    AsistenciaService.getSalud()
      .then((s) => setDryRun(Boolean(s.dry_run)))
      .catch(() => setDryRun(null))
  }, [abierto, dryRun])

  const avisos = useMemo(() => avisosDe(rows, jefatura.trim()), [rows, jefatura])
  const emailOk = EMAIL.test(jefatura.trim())

  const cerrar = () => {
    setAbierto(false)
    setResultado(null)
    setError(null)
  }

  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const res = await AsistenciaService.notificarJefatura(obraId, avisosDe(rows, jefatura.trim()))
      try {
        localStorage.setItem('asistencia_jefatura', jefatura.trim())
      } catch {
        // Sin localStorage se pierde la comodidad, no el envío.
      }
      setResultado(res)
      onEnviado?.(res.enviados)
      if (res.fallidos > 0) {
        setError(`${res.fallidos} correo(s) fallaron: ${res.detalles.join(' · ')}`)
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'No se pudieron enviar los correos.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        disabled={!rows.length}
        title="Envía un correo por trabajador con todas sus fechas"
        className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40"
      >
        ✉ Avisar a jefatura{rows.length ? ` (${rows.length})` : ''}
      </button>

      {abierto && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => !enviando && cerrar()}
        >
          <div
            className="bg-white rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Avisar a jefatura"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-app-line">
              <h2 className="text-lg font-semibold text-app-ink">Avisar a jefatura</h2>
              <p className="text-sm text-app-muted mt-1">
                Un correo por trabajador con todas sus fechas y un link al formulario de motivos
                ({avisos.length} correo{avisos.length === 1 ? '' : 's'}, {rows.length} día
                {rows.length === 1 ? '' : 's'}).
                {dryRun && ' El servidor está en modo de prueba: no se enviará nada.'}
              </p>
            </div>

            <div className="px-6 py-4 overflow-auto flex-1">
              <label className="text-sm text-app-muted">
                Correo de la jefatura
                <input
                  type="email"
                  value={jefatura}
                  placeholder="jefatura@empresa.cl"
                  onChange={(e) => setJefatura(e.target.value)}
                  className="block mt-1 w-full text-sm border border-app-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-app-ink"
                />
              </label>

              <ul className="mt-4 text-sm space-y-1">
                {(resultado?.previews ?? avisos).map((a) => (
                  <li key={a.rut}>
                    <strong className="text-app-ink">{a.nombre || a.rut}</strong>{' '}
                    <span className="text-app-muted">— {a.fechas.join(', ')}</span>
                    {resultado?.dry_run && (
                      <>
                        {' · '}
                        <a href={a.url} target="_blank" rel="noreferrer"
                           className="text-app-brand underline">
                          abrir formulario
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              {resultado?.dry_run && (
                <p className="mt-4 px-3 py-2 text-sm border rounded bg-amber-50 text-amber-800 border-amber-200">
                  No se envió ningún correo (ASISTENCIA_DRY_RUN). Los avisos sí quedaron creados,
                  así que los formularios de arriba son reales: se pueden responder y la respuesta
                  aparece en la columna Jefatura.
                </p>
              )}
              {resultado && !resultado.dry_run && (
                <p className="mt-4 text-sm text-app-ink">
                  {resultado.enviados} correo(s) enviados.
                </p>
              )}

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-app-line flex flex-wrap gap-3">
              {!resultado && (
                <button
                  onClick={enviar}
                  disabled={!emailOk || enviando}
                  className="px-4 py-1.5 text-sm rounded bg-app-brand text-white disabled:opacity-40"
                >
                  {enviando
                    ? 'Generando…'
                    : dryRun
                      ? `Generar vista previa (${avisos.length})`
                      : `Enviar ${avisos.length} correo(s)`}
                </button>
              )}
              {resultado?.previews?.length > 0 && (
                <button
                  onClick={() => descargarPreview(resultado.previews, { obra, desde, hasta })}
                  className="px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface"
                >
                  Descargar vista previa (HTML)
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

export default AvisarJefatura
