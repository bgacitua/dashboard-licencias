import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { getDotacion } from '../services/compensaciones'
import { LOCALE } from './PasoResultado'
import FichaPersona, { BANDA, POS, compa, decimal, posBanda, posicion } from './FichaPersona'

const grado = (p) => (p.hay_grado == null ? 'Sin HAY' : String(p.hay_grado))
const porGrado = (a, b) => (a === 'Sin HAY') - (b === 'Sin HAY') || a - b
const uniq = (a, orden) => [...new Set(a.filter(Boolean))].sort(orden)
const cargo = (p) => p.cargo ?? p.cargo_buk
const etiqueta = (p) => `${p.nombre} · ${cargo(p) ?? 'sin cargo'}`
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—')
// Desplazamiento horizontal determinístico (±0,25) para que no se tapen los del mismo grado
const jitter = (doc) => ([...doc].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 1000, 7) / 1000 - 0.5) * 0.5
const campo = 'rounded-lg border border-app-line bg-white px-2 py-1.5 text-[13px] text-app-ink focus:border-app-ink focus:outline-none'

export default function Dotacion({ estudio }) {
  const [personas, setPersonas] = useState(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState({}) // valores elegidos por filtro (dentro de un filtro suman, entre filtros se encadenan)
  const [texto, setTexto] = useState({}) // lo escrito en cada buscador antes de elegir
  const [ficha, setFicha] = useState(null)
  const [modo, setModo] = useState('mercado') // color de los puntos: posición en mercado o en la banda interna
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
  const [grupos, ubicar] = modo === 'banda' ? [BANDA, posBanda] : [POS, posicion]
  // Una banda por grado presente en el gráfico (todas las personas del grado traen la misma)
  const bandas = [...new Map(enGrafico.filter((p) => p.banda_mid != null).map((p) => [p.hay_grado, p])).values()]
    .sort((a, b) => a.hay_grado - b.hay_grado)
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
    series: [...Object.entries(grupos).map(([k, nombre]) => ({
      name: nombre, type: 'scatter', symbolSize: 9,
      itemStyle: k === 'sinref' ? { color: 'transparent', borderColor: colores.sinref, borderWidth: 1.5 } : { color: colores[k], opacity: 0.85 },
      emphasis: { scale: 1.8, itemStyle: { borderColor: ink, borderWidth: 1.5 } },
      data: enGrafico.filter((p) => ubicar(p) === k).map((p) => ({ value: [p.hay_grado + jitter(p.documento), p.base_wage], p })),
    })), {
      // Franja 80%–120% por grado y línea del midpoint; se oculta desde la leyenda
      name: 'Banda interna', type: 'line', symbol: 'none', silent: true, z: 1,
      lineStyle: { color: muted, type: 'dashed', width: 1 }, itemStyle: { color: muted },
      data: bandas.map((p) => [p.hay_grado, p.banda_mid]),
      markArea: { silent: true, itemStyle: { color: muted, opacity: 0.12 },
        data: bandas.map((p) => [{ xAxis: p.hay_grado - 0.35, yAxis: p.banda_min }, { xAxis: p.hay_grado + 0.35, yAxis: p.banda_max }]) },
    }],
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-app-line bg-white p-3">
        {FILTROS.map((f) => (
          <label key={f.k} className="grid gap-1 text-[11px] font-medium uppercase tracking-wide text-app-muted">
            {f.titulo}
            <input list={`dl-${f.k}`} value={texto[f.k] ?? ''} onChange={(e) => buscar(f, e.target.value)}
              placeholder="Buscar…" autoComplete="off" className={campo} />
            <datalist id={`dl-${f.k}`}>{opciones[f.k].filter((v) => !vigente[f.k].includes(v)).map((v) => <option key={v} value={v} />)}</datalist>
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
          <span className="flex items-center gap-1 text-xs text-app-muted">Colorear por
            {[['mercado', 'Mercado'], ['banda', 'Banda interna']].map(([k, t]) => (
              <button key={k} type="button" onClick={() => setModo(k)}
                className={`rounded-full border px-2 py-0.5 ${modo === k ? 'border-app-ink text-app-ink' : 'border-app-line'}`}>{t}</button>
            ))}
          </span>
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
