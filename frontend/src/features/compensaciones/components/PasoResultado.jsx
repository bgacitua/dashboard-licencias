import React, { useState } from 'react'

const LOCALE = { CL: 'es-CL', PE: 'es-PE', BR: 'pt-BR' }
const MEDIDAS = [['COMP1', 'Sueldo base'], ['COMP3_REAL', 'Compensación total']]
const ESTADISTICAS = ['p25', 'mediana', 'promedio', 'p75']

export default function PasoResultado({ resultado, pais, nivel }) {
  const [mensual, setMensual] = useState(false)
  const { moneda, factor_mensual, filas } = resultado

  const moneyFmt = new Intl.NumberFormat(LOCALE[pais], { style: 'currency', currency: moneda, maximumFractionDigits: 0 })
  const monto = (v) => (v == null ? 's/d' : moneyFmt.format(mensual ? v / factor_mensual : v))

  return (
    <div className="space-y-6">
      <div className="inline-flex overflow-hidden rounded-md border border-app-line">
        {[[false, 'Anual'], [true, 'Mensual']].map(([valor, etiqueta]) => (
          <button key={etiqueta} type="button" aria-pressed={mensual === valor} onClick={() => setMensual(valor)}
            className={`px-3 py-1.5 text-xs font-medium ${mensual === valor ? 'bg-app-brand text-white' : 'text-app-muted'}`}>
            {etiqueta}
          </button>
        ))}
      </div>

      {MEDIDAS.map(([codigo, nombre]) => (
        <section key={codigo}>
          <h2 className="mb-2 text-sm font-semibold text-app-ink">{nombre} <span className="font-normal text-app-muted">({codigo})</span> · Nivel {nivel.codigo} <span className="font-normal text-app-muted">{nivel.nombre}</span></h2>
          <div className="overflow-x-auto rounded-xl border border-app-line bg-white">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-app-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Cargo</th>
                  <th className="px-4 py-2 text-right font-medium">N° compañías</th>
                  <th className="px-4 py-2 text-right font-medium">P25</th>
                  <th className="px-4 py-2 text-right font-medium">Mediana</th>
                  <th className="px-4 py-2 text-right font-medium">Promedio</th>
                  <th className="px-4 py-2 text-right font-medium">P75</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-line">
                {filas.filter((f) => f.medida_codigo === codigo).map((f) => (
                  <tr key={`${f.tipo}-${f.cargo_codigo}`} className={f.tipo.startsWith('hibrido') || f.tipo === 'promedio_subfamilias' ? 'font-semibold' : ''}>
                    <td className="px-4 py-2">
                      {f.titulo} {f.cargo_codigo && <span className="text-app-muted">{f.cargo_codigo}</span>}
                    </td>
                    <td className="px-4 py-2 text-right">{f.n_companias ?? (f.n_companias == null && f.tipo !== 'cargo' && f.tipo !== 'subfamilia' ? '—' : 's/d')}</td>
                    {ESTADISTICAS.map((k) => (
                      <td key={k} className="px-4 py-2 text-right">{monto(f[k])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
