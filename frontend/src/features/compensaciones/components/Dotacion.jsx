import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { getDotacion } from '../services/compensaciones'
import { LOCALE } from './PasoResultado'
import FichaPersona, { POS, compa, decimal, posicion } from './FichaPersona'

const grado = (p) => (p.hay_grado == null ? 'Sin HAY' : String(p.hay_grado))
const porGrado = (a, b) => (a === 'Sin HAY') - (b === 'Sin HAY') || a - b
const uniq = (a, orden) => [...new Set(a.filter(Boolean))].sort(orden)
const etiqueta = (p) => `${p.nombre} · ${p.cargo ?? p.cargo_buk ?? 'sin cargo'}`
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—')
// Desplazamiento horizontal determinístico (±0,25) para que no se tapen los del mismo grado
const jitter = (doc) => ([...doc].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 1000, 7) / 1000 - 0.5) * 0.5
const campo = 'rounded-lg border border-app-line bg-white px-2 py-1.5 text-[13px] text-app-ink focus:border-app-ink focus:outline-none'

export default function Dotacion({ estudio }) {
  const [personas, setPersonas] = useState(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState({}) // valor elegido por filtro
  const [texto, setTexto] = useState({}) // lo escrito en los buscadores (Jefatura y Persona)
  const [ficha, setFicha] = useState(null)
  const grafico = useRef(null)

  useEffect(() => {
    getDotacion(estudio.id).then(setPersonas).catch(() => setError('No se pudo cargar la dotación.'))
  }, [])

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
    { k: 'empresa', titulo: 'Empresa', todos: 'Todas', valores: (b) => uniq(b.map((p) => p.empresa)), cumple: (p, v) => p.empresa === v },
    { k: 'cc', titulo: 'Centro de costo', todos: 'Todos', valores: (b) => uniq(b.map((p) => p.centro_costo)), cumple: (p, v) => p.centro_costo === v },
    { k: 'jefe', titulo: 'Jefatura (toda su línea)', lista: true,
      valores: (b) => { const d = new Set(b.map((p) => p.documento)); return jefes.filter((j) => [...linea(j.documento)].some((x) => d.has(x))).map(etiqueta) },
      cumple: (p, v) => linea(jefes.find((j) => etiqueta(j) === v).documento).has(p.documento) },
    { k: 'grado', titulo: 'Grado HAY', todos: 'Todos', valores: (b) => uniq(b.map(grado), porGrado), cumple: (p, v) => grado(p) === v },
    { k: 'persona', titulo: 'Persona', lista: true, valores: (b) => b.map(etiqueta).sort(), cumple: (p, v) => etiqueta(p) === v },
  ]
  let lista = personas || []
  const opciones = {}, vigente = {}
  for (const f of FILTROS) {
    opciones[f.k] = f.valores(lista)
    vigente[f.k] = opciones[f.k].includes(sel[f.k]) ? sel[f.k] : ''
    if (vigente[f.k]) lista = lista.filter((p) => f.cumple(p, vigente[f.k]))
  }

  // Un cambio arriba que deja inválido un valor de abajo lo limpia
  const invalidos = FILTROS.filter((f) => sel[f.k] && !vigente[f.k]).map((f) => f.k)
  useEffect(() => {
    if (!invalidos.length) return
    const sin = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !invalidos.includes(k)))
    setSel(sin)
    setTexto(sin)
  }, [invalidos.join()])

  const buscar = (f, v) => {
    setTexto((t) => ({ ...t, [f.k]: v }))
    if (!v || opciones[f.k].includes(v)) setSel((s) => ({ ...s, [f.k]: v })) // solo cuenta un valor de la lista
  }
  const limpiar = () => {
    setSel({})
    setTexto({})
    grafico.current?.getEchartsInstance().dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!personas) return <p className="text-sm text-app-muted">Cargando…</p>

  const css = getComputedStyle(document.documentElement)
  const tok = (n) => css.getPropertyValue(`--color-app-${n}`).trim()
  const [ink, muted, line] = [tok('ink'), tok('muted'), tok('line')]
  const colores = { bajo: tok('brand'), dentro: '#2f6f8f', sobre: '#b7791f', sinref: tok('outline') }
  const locale = LOCALE[estudio.pais]
  const compacto = new Intl.NumberFormat(locale, { notation: 'compact' })

  const enGrafico = lista.filter((p) => p.hay_grado != null && p.base_wage != null)
  const comps = lista.map(compa).filter((x) => x != null).sort((a, b) => a - b)
  const fuera = lista.filter((p) => p.hay_grado == null).length
  const kpis = [
    ['Dotación', lista.length],
    ['Con cargo homologado', pct(lista.filter((p) => p.nivel).length, lista.length)],
    ['Con evaluación HAY', pct(lista.filter((p) => p.hay_grado != null).length, lista.length)],
    ['Compa-ratio mediano', decimal(comps[Math.floor(comps.length / 2)])],
  ]

  const option = {
    animation: false,
    grid: { left: 70, right: 46, top: 48, bottom: 64 },
    legend: { top: 0, left: 0, textStyle: { color: ink }, itemWidth: 10, itemHeight: 10 },
    toolbox: { right: 8, top: 0, iconStyle: { borderColor: muted }, feature: {
      dataZoom: { title: { zoom: 'Seleccionar área', back: 'Deshacer zoom' } }, restore: { title: 'Restablecer' } } },
    tooltip: { trigger: 'item', textStyle: { color: ink, fontSize: 12 },
      formatter: ({ data: { p } }) => `<b>${p.nombre}</b><br>${p.cargo ?? p.cargo_buk ?? ''}<br>`
        + `Nivel ${p.nivel ? `${p.nivel} · ${p.nivel_nombre}` : 'sin homologar'} · Grado HAY ${p.hay_grado}`
        + `${compa(p) != null && p.mediana == null ? '<br>Compa-ratio ref. promedio' : ''}`
        + `<br><span style="color:${muted}">Doble clic para ver la ficha</span>` },
    xAxis: { type: 'value', name: 'Grado HAY', nameLocation: 'middle', nameGap: 28, interval: 1,
      min: (v) => Math.floor(v.min) - 1, max: (v) => Math.ceil(v.max) + 1,
      axisLine: { lineStyle: { color: line } }, axisLabel: { color: muted }, splitLine: { lineStyle: { color: line, opacity: 0.5 } } },
    yAxis: { type: 'value', name: 'Sueldo base mensual', nameTextStyle: { color: muted, align: 'left' }, scale: true,
      axisLabel: { color: muted, formatter: (v) => compacto.format(v) },
      axisLine: { lineStyle: { color: line } }, splitLine: { lineStyle: { color: line, opacity: 0.5 } } },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
      { type: 'inside', yAxisIndex: 0, filterMode: 'none' },
      { type: 'slider', xAxisIndex: 0, filterMode: 'none', height: 16, bottom: 6, labelFormatter: (v) => Math.round(v) },
      { type: 'slider', yAxisIndex: 0, filterMode: 'none', width: 14, right: 8, showDetail: false },
    ],
    series: Object.entries(POS).map(([k, nombre]) => ({
      name: nombre, type: 'scatter', symbolSize: 9,
      itemStyle: k === 'sinref' ? { color: 'transparent', borderColor: colores.sinref, borderWidth: 1.5 } : { color: colores[k], opacity: 0.85 },
      emphasis: { scale: 1.8, itemStyle: { borderColor: ink, borderWidth: 1.5 } },
      data: enGrafico.filter((p) => posicion(p) === k).map((p) => ({ value: [p.hay_grado + jitter(p.documento), p.base_wage], p })),
    })),
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-app-line bg-white p-3">
        {FILTROS.map((f) => (
          <label key={f.k} className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-app-muted">
            {f.titulo}
            {f.lista ? (
              <>
                <input list={`dl-${f.k}`} value={texto[f.k] ?? ''} onChange={(e) => buscar(f, e.target.value)}
                  placeholder="Buscar…" autoComplete="off" className={campo} />
                <datalist id={`dl-${f.k}`}>{opciones[f.k].map((v) => <option key={v} value={v} />)}</datalist>
              </>
            ) : (
              <select value={vigente[f.k]} onChange={(e) => setSel((s) => ({ ...s, [f.k]: e.target.value }))} className={campo}>
                <option value="">{f.todos}</option>
                {opciones[f.k].map((v) => <option key={v}>{v}</option>)}
              </select>
            )}
          </label>
        ))}
        <button type="button" onClick={limpiar} className="py-1.5 text-xs font-medium text-app-brand">Limpiar filtros</button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map(([t, v]) => (
          <div key={t} className="rounded-xl border border-app-line bg-white px-4 py-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-app-muted">{t}</span>
            <p className="text-2xl font-bold text-app-ink">{v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-app-line bg-white p-3">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-app-ink">Sueldo base mensual vs grado HAY</h2>
          <span className="text-xs text-app-muted">Rueda: acercar · Arrastrar: mover · Lupa: seleccionar un área · Doble clic en un punto: ficha</span>
        </div>
        <ReactECharts ref={grafico} option={option} style={{ height: 520 }}
          onEvents={{ dblclick: ({ data }) => data?.p && setFicha(data.p) }} />
        {fuera > 0 && <p className="mt-1 text-xs text-app-muted">{fuera} persona{fuera > 1 ? 's' : ''} sin evaluación HAY de su cargo no aparece{fuera > 1 ? 'n' : ''} en el gráfico.</p>}
      </div>

      {ficha && <FichaPersona p={ficha} personas={personas} estudio={estudio} colores={colores} onCerrar={() => setFicha(null)} />}
    </div>
  )
}
