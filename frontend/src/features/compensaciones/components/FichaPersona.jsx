import React, { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { getHistorialPersona } from '../services/compensaciones'
import { LOCALE } from './PasoResultado'

// Posición frente al mercado (sueldo mensual vs COMP1 mensual del cargo homologado)
export const POS = { bajo: 'Bajo P25', dentro: 'Entre P25 y P75', sobre: 'Sobre P75', sinref: 'Sin referencia' }
export const referencia = (p) => p.mediana ?? p.promedio
export const compa = (p) => (referencia(p) ? p.base_wage / referencia(p) : null)
export const posicion = (p) =>
  p.p25 == null || p.p75 == null ? 'sinref' : p.base_wage < p.p25 ? 'bajo' : p.base_wage > p.p75 ? 'sobre' : 'dentro'
const cuartil = (p) =>
  p.p25 == null || p.mediana == null || p.p75 == null ? '—'
    : p.base_wage < p.p25 ? 'Q1' : p.base_wage < p.mediana ? 'Q2' : p.base_wage <= p.p75 ? 'Q3' : 'Q4'
export const decimal = (x) => (x == null ? '—' : x.toFixed(2).replace('.', ','))

const TIPOS = {
  sueldo_base: ['payments', 'Sueldo'], cargo: ['work', 'Cargo'], centro_costo: ['account_tree', 'Centro de costo'],
  area: ['apartment', 'Área'], jefatura: ['supervisor_account', 'Jefatura'],
}
const dia = (s) => new Date(`${s}T00:00`)
const atipico = (c) => c.tipo_cambio === 'sueldo_base' && (c.variacion_pct < 0 || c.variacion_pct > 30)
const signo = (x) => `${x > 0 ? '+' : ''}${String(Math.round(x * 10) / 10).replace('.', ',')}%`

function Historial({ p, estudio, fmt, fecha }) {
  const [cambios, setCambios] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getHistorialPersona(estudio.id, p.employee_id).then(setCambios).catch(() => setError('No se pudo cargar el historial.'))
  }, [p.employee_id])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!cambios) return <p className="text-sm text-app-muted">Cargando…</p>
  if (!cambios.length) return <p className="text-sm text-app-muted">Sin historial registrado desde junio 2022</p>

  const sueldos = cambios.filter((c) => c.tipo_cambio === 'sueldo_base').reverse() // del más antiguo
  const cuenta = (t) => cambios.filter((c) => c.tipo_cambio === t).length
  const inicio = sueldos[0] && Number(sueldos[0].valor_anterior)
  const desde = [p.fecha_ingreso, '2022-06-01'].filter(Boolean).sort().pop()
  const curva = sueldos.length ? [[desde, inicio], ...sueldos.map((c) => [c.fecha_cambio, Number(c.valor_nuevo)]),
    [new Date().toISOString().slice(0, 10), Number(sueldos.at(-1).valor_nuevo)]] : []
  const valor = (c, v) => (c.tipo_cambio === 'sueldo_base' && v != null ? fmt.format(Number(v)) : v ?? '—')

  return (
    <div className="space-y-3">
      {curva.length > 0 && (
        <ReactECharts style={{ height: 180 }} option={{
          animation: false, grid: { left: 70, right: 12, top: 12, bottom: 24 },
          tooltip: { trigger: 'axis', valueFormatter: (v) => fmt.format(v) },
          xAxis: { type: 'time' },
          yAxis: { type: 'value', scale: true, axisLabel: { formatter: (v) => fmt.format(v) } },
          series: [{ type: 'line', step: 'end', symbolSize: 5, data: curva }],
        }} />
      )}
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[['Crecimiento sueldo', inicio ? signo((p.base_wage / inicio - 1) * 100) : '—'], ['Reajustes', sueldos.length],
          ['Cambios de cargo', cuenta('cargo')], ['Cambios de CC', cuenta('centro_costo')]].map(([t, v]) => (
          <div key={t} className="rounded-lg border border-app-line px-2 py-1.5">
            <span className="text-app-muted">{t}</span><br /><b className="text-sm text-app-ink">{v}</b>
          </div>
        ))}
      </div>
      <ul className="space-y-1.5 text-xs">
        {cambios.map((c, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] text-app-muted">{TIPOS[c.tipo_cambio]?.[0] ?? 'history'}</span>
            <span className="w-20 shrink-0 text-app-muted">{fecha(c.fecha_cambio)}</span>
            <span className="min-w-0 flex-1 text-app-ink">
              <b>{TIPOS[c.tipo_cambio]?.[1] ?? c.tipo_cambio}</b>: {valor(c, c.valor_anterior)} → {valor(c, c.valor_nuevo)}
              {c.tipo_cambio === 'sueldo_base' && c.variacion_pct != null && ` (${signo(c.variacion_pct)})`}
              {atipico(c) && (
                <span title="Puede ser un cambio de jornada, una corrección o una promoción"
                  className="ml-2 rounded-full border border-app-brand px-1.5 text-[10px] font-semibold text-app-brand">Revisar</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function FichaPersona({ p, personas, estudio, colores, onCerrar }) {
  const [sinFoto, setSinFoto] = useState(false)

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [])

  const locale = LOCALE[estudio.pais]
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: estudio.moneda, maximumFractionDigits: 0 })
  const dinero = (v) => (v == null ? '—' : fmt.format(v))
  const fecha = (s) => dia(s).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
  const anios = p.fecha_ingreso && (Date.now() - dia(p.fecha_ingreso)) / 3.156e10
  const pares = p.cargo_empresa_id == null ? [] : personas.filter((q) => q.cargo_empresa_id === p.cargo_empresa_id && q.base_wage != null)
  const pos = posicion(p)
  const c = compa(p)
  const porPromedio = c != null && p.mediana == null ? ' (ref. promedio)' : ''
  const x = (v) => {
    const lo = Math.min(p.p25, p.base_wage) * 0.92, hi = Math.max(p.p75, p.base_wage) * 1.06
    return `${((v - lo) / (hi - lo)) * 100}%`
  }
  const datos = [
    ['Fecha de ingreso', p.fecha_ingreso ? `${fecha(p.fecha_ingreso)} (${anios < 1 ? `${Math.round(anios * 12)} meses` : `${anios.toFixed(1).replace('.', ',')} años`})` : '—'],
    ['Nivel Mercer', p.nivel ? `${p.nivel} · ${p.nivel_nombre}` : 'Sin homologar'],
    ['Grado HAY', p.hay_grado != null ? `${p.hay_grado} (${p.hay_puntos} pts)` : '—'],
    ['Sueldo base', dinero(p.base_wage)],
    ['Último cambio de sueldo', p.fecha_cambio_sueldo
      ? `${dinero(p.sueldo_base_anterior)} → ${dinero(p.base_wage)}${p.variacion_sueldo_pct != null ? ` (${signo(p.variacion_sueldo_pct)})` : ''} desde ${fecha(p.fecha_cambio_sueldo)}` : '—'],
    ['Promedio interno del cargo', pares.length ? `${dinero(pares.reduce((a, q) => a + q.base_wage, 0) / pares.length)} (${pares.length} pers.)` : '—'],
    ['Promedio de mercado del cargo', dinero(p.promedio)],
    ['Posición en mercado', (
      <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={{ color: colores[pos] }}>
        {pos !== 'sinref' ? POS[pos] : p.nivel ? 'Mercer no publica P25/P75 para este nivel' : 'Cargo sin homologar'}
      </span>
    )],
    ['Compa-ratio · cuartil', `${decimal(c)}${porPromedio} · ${cuartil(p)}`],
  ]
  const titulo = 'mb-1 text-[11px] font-medium uppercase tracking-wide text-app-muted'

  return (
    <div onClick={(e) => e.target === e.currentTarget && onCerrar()} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" className="max-h-full w-full max-w-xl space-y-4 overflow-auto rounded-xl border border-app-line bg-white p-5 text-sm">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-app-line bg-app-surface text-xl text-app-muted">
            {p.url_picture && !sinFoto
              ? <img src={p.url_picture} alt="" onError={() => setSinFoto(true)} className="h-full w-full object-cover" />
              : p.nombre.split(' ').slice(0, 2).map((s) => s[0]).join('')}
          </div>
          <div>
            <h3 className="text-lg font-bold text-app-ink">{p.nombre}</h3>
            <p className="text-app-muted">{p.cargo ?? p.cargo_buk} · {p.empresa}</p>
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          {datos.map(([t, v]) => <React.Fragment key={t}><dt className="text-app-muted">{t}</dt><dd className="text-right text-app-ink">{v}</dd></React.Fragment>)}
        </dl>

        {p.p25 != null && p.p75 != null && (
          <div>
            <p className={titulo}>Mercado del cargo (mensual)</p>
            <div className="relative h-8">
              <div className="absolute inset-x-0 top-3 h-1.5 rounded bg-app-line" />
              <div className="absolute top-2.5 h-2.5 rounded border" style={{ left: x(p.p25), width: `calc(${x(p.p75)} - ${x(p.p25)})`, borderColor: colores.dentro, background: `${colores.dentro}22` }} />
              {p.mediana != null && <div className="absolute top-1.5 h-4 w-0.5" style={{ left: x(p.mediana), background: colores.dentro }} />}
              <div className="absolute top-1.5 -ml-2 h-4 w-4 rounded-full border-2 border-white" style={{ left: x(p.base_wage), background: colores[pos] }} />
            </div>
            <div className="flex justify-between text-[11px] text-app-muted">
              <span>P25 {dinero(p.p25)}</span><span>Mediana {dinero(p.mediana)}</span><span>P75 {dinero(p.p75)}</span>
            </div>
          </div>
        )}

        <div>
          <p className={titulo}>Historial</p>
          <Historial p={p} estudio={estudio} fmt={fmt} fecha={fecha} />
        </div>

        <div>
          <p className={titulo}>Banda salarial de la empresa</p>
          <p className="rounded-lg border border-dashed border-app-outline px-3 py-2 text-xs text-app-muted">
            Pendiente: se mostrará la posición en la banda de su grado cuando las bandas estén definidas.
          </p>
        </div>

        <div className="text-right">
          <button type="button" autoFocus onClick={onCerrar}
            className="rounded-lg border border-app-line px-3 py-1.5 text-xs font-medium text-app-ink hover:border-app-ink">Cerrar</button>
        </div>
      </div>
    </div>
  )
}
