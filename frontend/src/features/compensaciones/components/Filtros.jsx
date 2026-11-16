import React, { useEffect, useId, useMemo, useState } from 'react'

const grado = (p) => (p.hay_grado == null ? 'Sin HAY' : String(p.hay_grado))
const porGrado = (a, b) => (a === 'Sin HAY') - (b === 'Sin HAY') || a - b
const uniq = (a, orden) => [...new Set(a.filter(Boolean))].sort(orden)
const cargo = (p) => p.cargo ?? p.cargo_buk
const etiqueta = (p) => `${p.nombre} · ${cargo(p) ?? 'sin cargo'}`
const campo = 'rounded-lg border border-app-line bg-white px-2 py-1.5 text-[13px] text-app-ink focus:border-app-ink focus:outline-none'

// Filtros en cascada sobre la dotación (Dotación y Cargos empresa). Devuelve [personas filtradas, barra, hay filtro activo].
export default function useFiltros(personas, alLimpiar) {
  const [sel, setSel] = useState({}) // valores elegidos por filtro (dentro de un filtro suman, entre filtros se encadenan)
  const [texto, setTexto] = useState({}) // lo escrito en cada buscador antes de elegir
  const id = useId() // Dotación y Cargos empresa pueden estar montadas a la vez

  // Árbol de jefaturas por documento: la línea de un jefe son él y todos sus descendientes
  const { linea, jefes } = useMemo(() => {
    const hijos = {}
    ;(personas || []).forEach((p) => p.jefe && (hijos[p.jefe] ||= []).push(p.documento))
    const linea = (doc) => {
      const r = new Set([doc]), q = [doc]
      while (q.length) (hijos[q.pop()] || []).forEach((h) => !r.has(h) && (r.add(h), q.push(h)))
      return r
    }
    return { linea, jefes: (personas || []).filter((p) => hijos[p.documento]) }
  }, [personas])

  // Cascada de mayor a menor alcance: cada filtro ofrece solo lo que dejan los de arriba y aplica su valor a los de abajo
  const FILTROS = [
    { k: 'empresa', titulo: 'Empresa', valores: (b) => uniq(b.map((p) => p.empresa)), cumple: (p, v) => p.empresa === v },
    { k: 'cc', titulo: 'Centro de costo', valores: (b) => uniq(b.map((p) => p.centro_costo)), cumple: (p, v) => p.centro_costo === v },
    { k: 'jefe', titulo: 'Jefatura (toda su línea)',
      valores: (b) => { const d = new Set(b.map((p) => p.documento)); return jefes.filter((j) => [...linea(j.documento)].some((x) => d.has(x))).map(etiqueta) },
      cumple: (p, v) => linea(jefes.find((j) => etiqueta(j) === v).documento).has(p.documento) },
    { k: 'grado', titulo: 'Grado HAY', valores: (b) => uniq(b.map(grado), porGrado), cumple: (p, v) => grado(p) === v },
    { k: 'cargo', titulo: 'Cargo', valores: (b) => uniq(b.map(cargo)), cumple: (p, v) => cargo(p) === v },
    { k: 'persona', titulo: 'Persona', valores: (b) => b.map(etiqueta).sort(), cumple: (p, v) => etiqueta(p) === v },
  ]
  let lista = personas || []
  const opciones = {}, vigente = {}
  for (const f of FILTROS) {
    opciones[f.k] = f.valores(lista)
    vigente[f.k] = (sel[f.k] || []).filter((v) => opciones[f.k].includes(v))
    if (vigente[f.k].length) lista = lista.filter((p) => vigente[f.k].some((v) => f.cumple(p, v)))
  }

  // Un cambio arriba que deja inválidos valores de abajo los quita
  const hayInvalidos = FILTROS.some((f) => (sel[f.k] || []).length !== vigente[f.k].length)
  useEffect(() => { if (hayInvalidos) setSel(vigente) }, [hayInvalidos])

  const buscar = (f, v) => {
    if (!opciones[f.k].includes(v)) return setTexto((t) => ({ ...t, [f.k]: v })) // solo cuenta un valor de la lista
    setSel((s) => ({ ...s, [f.k]: [...new Set([...(s[f.k] || []), v])] }))
    setTexto((t) => ({ ...t, [f.k]: '' }))
  }
  const quitar = (f, v) => setSel((s) => ({ ...s, [f.k]: s[f.k].filter((x) => x !== v) }))
  const limpiar = () => {
    setSel({})
    setTexto({})
    alLimpiar?.()
  }

  const activos = FILTROS.flatMap((f) => vigente[f.k])
  // Desplegable: se abre para filtrar y se cierra para revisar; cerrado muestra lo que está filtrando
  const barra = (
    <details className="rounded-xl border border-app-line bg-white">
      <summary className="cursor-pointer truncate px-3 py-2 text-sm font-semibold text-app-ink">
        Filtros{activos.length > 0 && <span className="font-normal text-app-muted"> · {activos.join(' · ')}</span>}
      </summary>
      <div className="flex flex-wrap items-start gap-3 border-t border-app-line p-3">
        {FILTROS.map((f) => (
          <label key={f.k} className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-app-muted">
            {f.titulo}
            <input list={`${id}-${f.k}`} value={texto[f.k] ?? ''} onChange={(e) => buscar(f, e.target.value)}
              placeholder="Buscar…" autoComplete="off" className={campo} />
            <datalist id={`${id}-${f.k}`}>{opciones[f.k].filter((v) => !vigente[f.k].includes(v)).map((v) => <option key={v} value={v} />)}</datalist>
            {vigente[f.k].length > 0 && (
              <span className="flex max-w-56 flex-wrap gap-1">
                {vigente[f.k].map((v) => (
                  <button key={v} type="button" onClick={() => quitar(f, v)} title={`Quitar ${v}`}
                    className="flex max-w-full gap-1 rounded-full border border-app-line px-2 py-0.5 text-[11px] normal-case tracking-normal text-app-ink hover:border-app-ink">
                    <span className="truncate">{v}</span>×
                  </button>
                ))}
              </span>
            )}
          </label>
        ))}
        {/* espacio del título para quedar a la altura de los buscadores */}
        <div className="grid gap-1 text-[11px]">&nbsp;<button type="button" onClick={limpiar} className="inline-flex h-8 items-center rounded-lg border border-app-brand bg-app-brand px-3 text-xs font-semibold text-white hover:bg-app-brand/90">Limpiar filtros</button></div>
      </div>
    </details>
  )

  return [lista, barra, FILTROS.some((f) => vigente[f.k].length)]
}
