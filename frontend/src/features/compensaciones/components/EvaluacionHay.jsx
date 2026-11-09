import React, { useEffect, useState } from 'react'
import { getHayHistorial, getHayOpciones, postHayCalcular, postHayEvaluacion } from '../services/compensaciones'

const S = ['-', '', '+']
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI']
// [título, bloque de /hay/opciones, campo del resultado, [[campo, etiqueta, valores]]]: el orden de los campos es el de las combinaciones
const GRUPOS = [
  ['Know-How', 'know_how', 'puntos_kh', [['tecnica', 'Técnica', [...'ABCDEFGH']], ['signo_tecnica', '', S],
    ['gestion', 'Gestión', ['T', 'I', 'II', 'III', 'IV']], ['signo_gestion', '', S], ['rrhh', 'RRHH', [1, 2, 3]]]],
  ['Solución de problemas', 'solucion', 'puntos_sp', [['marco', 'Marco', [...'ABCDEFGH']],
    ['complejidad', 'Complejidad', [1, 2, 3, 4, 5]], ['signo_complejidad', '', ['', '+']]]],
  ['Responsabilidad', 'responsabilidad', 'puntos_resp', [['libertad', 'Libertad', [...'ABCDEFGH']], ['signo_libertad', '', S],
    ['magnitud', 'Magnitud', ['N', '1', '2', '3', '4']], ['impacto', 'Impacto', [...ROMANOS, 'R', 'C', 'S', 'P']]]],
]
const CAMPOS = GRUPOS.flatMap((g) => g[3].map((c) => c[0]))
const VACIO = Object.fromEntries(CAMPOS.map((k) => [k, k.startsWith('signo') ? '' : null]))
const entradas = (h) => Object.fromEntries(CAMPOS.map((k) => [k, h[k]]))
const sel = 'rounded-lg border border-app-line bg-white px-2 py-1.5 text-xs text-app-ink'
let opcionesP = null // se piden una vez por sesión

// Calculadora HAY de un cargo de la empresa: parte de la evaluación vigente, recalcula en vivo y el admin guarda.
// `evaluados`: cargos del país con HAY vigente, para copiar su evaluación (ej. de líder a jefe).
export default function EvaluacionHay({ c, evaluados, esAdmin, onGuardado }) {
  const [opciones, setOpciones] = useState(null)
  const [historial, setHistorial] = useState([])
  const [e, setE] = useState(VACIO)
  const [comentario, setComentario] = useState('')
  const [r, setR] = useState(null)
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState(false)
  const [copia, setCopia] = useState('')

  useEffect(() => {
    ;(opcionesP ||= getHayOpciones()).then(setOpciones).catch(() => { opcionesP = null; setError('No se pudieron cargar las tablas HAY.') })
    getHayHistorial(c.id).then((l) => { setHistorial(l); if (l.length) setE(entradas(l[0])) }).catch(() => {})
  }, [c.id])

  useEffect(() => {
    setR(null)
    setError('')
    if (CAMPOS.some((k) => e[k] == null)) return
    let vigente = true
    postHayCalcular(e)
      .then((x) => vigente && setR(x))
      .catch((err) => vigente && setError(err.response?.data?.detail || 'No se pudo calcular.'))
    return () => { vigente = false }
  }, [e])

  // Una opción es válida si alguna combinación la tiene junto con los campos anteriores ya elegidos del bloque.
  const valida = (bloque, campos, i, v) =>
    !opciones || opciones[bloque].some((comb) => comb[i] === v && campos.slice(0, i).every(([k], j) => e[k] == null || comb[j] === e[k]))

  const cambiar = (k, x, numerico) => {
    setGuardado(false)
    setE((a) => ({ ...a, [k]: x === '' && !k.startsWith('signo') ? null : numerico ? Number(x) : x }))
  }

  const etiqueta = (x) => `${x.name} (${x.code}) · HAY ${x.hay_grado}`
  const copiar = (texto) => {
    setCopia(texto)
    const o = evaluados.find((x) => x.id !== c.id && etiqueta(x) === texto)
    if (!o) return
    getHayHistorial(o.id)
      .then((l) => { setE(entradas(l[0])); setGuardado(false); setComentario(`Copia de ${o.name} (${o.code})`); setCopia('') })
      .catch(() => setError('No se pudo cargar la evaluación a copiar.'))
  }

  const guardar = () =>
    postHayEvaluacion({ cargo_empresa_id: c.id, ...e, comentario: comentario.trim() || null })
      .then((h) => { setHistorial((l) => [h, ...l]); setGuardado(true); setComentario(''); onGuardado(h) })
      .catch((err) => setError(err.response?.data?.detail || 'No se pudo guardar.'))

  return (
    <div className="space-y-3 rounded-lg border border-app-line bg-white p-3">
      <input list={`hay-copia-${c.id}`} value={copia} onChange={(ev) => copiar(ev.target.value)}
        placeholder="Copiar la evaluación de otro cargo…"
        className="w-full rounded-lg border border-app-line px-2 py-1.5 text-xs text-app-ink focus:border-app-ink focus:outline-none" />
      <datalist id={`hay-copia-${c.id}`}>
        {evaluados.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={etiqueta(x)} />)}
      </datalist>
      {GRUPOS.map(([titulo, bloque, puntos, campos]) => (
        <div key={bloque} className="flex flex-wrap items-center gap-2">
          <span className="w-40 text-xs font-semibold text-app-ink">{titulo}</span>
          {campos.map(([k, etiqueta, valores], i) => (
            <select key={k} value={e[k] ?? ''} title={etiqueta || 'Signo'} className={sel}
              onChange={(ev) => cambiar(k, ev.target.value, typeof valores[0] === 'number')}>
              {!k.startsWith('signo') && <option value="">{etiqueta}</option>}
              {valores.map((v) => <option key={v} value={v} disabled={!valida(bloque, campos, i, v)}>{v === '' ? '·' : v}</option>)}
            </select>
          ))}
          {r && <span className="text-xs text-app-muted">{r[puntos]} pts{bloque === 'solucion' && ` (${r.porcentaje_sp}%)`}</span>}
        </div>
      ))}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {r && <p className="text-sm text-app-ink">Total <b>{r.puntos_total}</b> puntos · Grado HAY <b>{r.grado}</b></p>}

      {esAdmin && (
        <div className="flex items-center gap-2">
          <input value={comentario} onChange={(ev) => setComentario(ev.target.value)} maxLength={1000} placeholder="Comentario (opcional)"
            className="flex-1 rounded-lg border border-app-line px-2 py-1.5 text-xs text-app-ink focus:border-app-ink focus:outline-none" />
          <button type="button" disabled={!r || guardado} onClick={guardar}
            className="inline-flex h-8 items-center rounded-lg bg-app-brand px-3 text-xs font-semibold text-white hover:bg-app-brand/90 disabled:opacity-50">
            {guardado ? 'Evaluación guardada' : 'Guardar evaluación'}
          </button>
        </div>
      )}

      {historial.length > 0 && (
        <div className="border-t border-app-line pt-2 text-xs text-app-muted">
          <p className="mb-1 font-semibold text-app-ink">Historial</p>
          {historial.map((h, i) => (
            <button key={h.id} type="button" onClick={() => { setE(entradas(h)); setGuardado(false) }}
              className="block w-full text-left hover:text-app-ink">
              {new Date(h.created_at).toLocaleDateString('es-CL')} · {h.puntos_total} pts · grado {h.grado} · {h.creado_por}
              {h.origen === 'excel' && ' (Excel)'}{i === 0 && ' · vigente'}{h.comentario && ` — ${h.comentario}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
