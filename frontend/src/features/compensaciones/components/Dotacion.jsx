import React, { useEffect, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { getDotacion } from '../services/compensaciones'
import { LOCALE } from './PasoResultado'
import useFiltros from './Filtros'
import FichaPersona, { BANDA, POS, compa, decimal, posBanda, posicion } from './FichaPersona'

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—')
// Desplazamiento horizontal determinístico (±0,25) para que no se tapen los del mismo grado
const jitter = (doc) => ([...doc].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 1000, 7) / 1000 - 0.5) * 0.5

export default function Dotacion({ estudio }) {
  const [personas, setPersonas] = useState(null)
  const [error, setError] = useState('')
  const [ficha, setFicha] = useState(null)
  const [modo, setModo] = useState('mercado') // color de los puntos: posición en mercado o en la banda interna
  const grafico = useRef(null)

  useEffect(() => {
    getDotacion(estudio.id).then(setPersonas).catch(() => setError('No se pudo cargar la dotación.'))
  }, [])

  const [lista, barra] = useFiltros(personas, () =>
    grafico.current?.getEchartsInstance().dispatchAction({ type: 'dataZoom', start: 0, end: 100 }))

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
      {barra}

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
