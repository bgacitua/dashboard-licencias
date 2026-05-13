import { useState } from 'react'
import { ChevronDown, Shield, TrendingDown, TrendingUp, Calendar } from 'lucide-react'
import { Card, CardContent } from './ui/card'
import { Separator } from './ui/separator'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { formatCLP, formatUSD } from '../lib/utils'

export function Resultados({ modo, resultados, moneda, onMonedaChange, dolarValue }) {
  const [openSections, setOpenSections] = useState(new Set())

  const toggle = (section) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const isOpen = (section) => openSections.has(section)

  const fmt = (v) =>
    moneda === 'USD' && dolarValue > 0 ? formatUSD(v / dolarValue) : formatCLP(v)

  const headerColor = 'bg-[#0c1a3a]'

  const headerTitle =
    modo === 'base_a_liquido' ? 'BASE → LÍQUIDO' : 'LÍQUIDO → BASE'

  const { bonoNavidad, bonoFiestasPatrias, bonoEscolaridad, bonoEmpresaAnual } = resultados

  return (
    <Card className="sticky top-4">
      <div className={`${headerColor} text-white rounded-t-xl p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/50 font-semibold mb-0.5">Resultado</p>
            <h2 className="text-base font-bold tracking-tight">{headerTitle}</h2>
          </div>
          <ToggleGroup
            type="single"
            value={moneda}
            onValueChange={(v) => v && onMonedaChange(v)}
            className="shrink-0 gap-1"
          >
            {['CLP', 'USD'].map((cur) => (
              <ToggleGroupItem
                key={cur}
                value={cur}
                className="h-7 px-3 text-xs font-semibold border border-white/20 text-white/70 rounded-lg
                  data-[state=on]:bg-white data-[state=on]:text-[#0c1a3a] data-[state=on]:border-white
                  hover:bg-white/10 hover:text-white"
              >
                {cur}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <p className="text-xs text-white/60 mt-1">1 USD = {formatCLP(dolarValue)}</p>
      </div>

      <CardContent className="p-4 space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
        {/* Entrada */}
        {modo === 'base_a_liquido' ? (
          <ResultRow label="Sueldo Base (entrada)" value={resultados.sueldoBase} variant="entrada" format={fmt} />
        ) : (
          <ResultRow label="Líquido Objetivo (entrada)" value={resultados.sueldoLiquido} variant="entrada" format={fmt} />
        )}

        <Separator className="my-2" />

        {/* Principal */}
        {modo === 'base_a_liquido' ? (
          <ResultRow label="SUELDO LÍQUIDO" value={resultados.sueldoLiquido} variant="principal" format={fmt} />
        ) : (
          <ResultRow label="SUELDO BASE" value={resultados.sueldoBase} variant="principal" format={fmt} />
        )}

        <Separator className="my-2" />

        {/* Haberes */}
        <AccordionSection
          icon={<TrendingUp className="h-4 w-4" />}
          label="Total Haberes"
          value={resultados.totalHaberes}
          variant="total"
          isOpen={isOpen('haberes')}
          onToggle={() => toggle('haberes')}
          format={fmt}
        >
          <ResultRow label="Sueldo Base" value={resultados.sueldoBase} format={fmt} />
          <ResultRow label="Gratificación" value={resultados.gratificacion} format={fmt} />
          {resultados.bonosImponibles > 0 && (
            <ResultRow label="Bonos Imponibles" value={resultados.bonosImponibles} format={fmt} />
          )}
          {resultados.movilizacion > 0 && (
            <ResultRow label="Movilización" value={resultados.movilizacion} format={fmt} />
          )}
          {resultados.bonosNoImponibles > 0 && (
            <ResultRow label="Bonos No Imponibles" value={resultados.bonosNoImponibles} format={fmt} />
          )}
        </AccordionSection>

        {/* Descuentos */}
        <AccordionSection
          icon={<TrendingDown className="h-4 w-4" />}
          label="Descuentos Trabajador"
          value={resultados.totalDescuentos}
          variant="descuento"
          isOpen={isOpen('descuentos')}
          onToggle={() => toggle('descuentos')}
          format={fmt}
        >
          <ResultRow label="Cotización Previsional (AFP)" value={resultados.cotizacionPrevisional} format={fmt} />
          <ResultRow label="Cotización Salud" value={resultados.cotizacionSalud} format={fmt} />
          <ResultRow label="Seguro Cesantía" value={resultados.cesantia} format={fmt} />
          {resultados.impuesto > 0 && (
            <ResultRow label="Impuesto Único" value={resultados.impuesto} format={fmt} />
          )}
        </AccordionSection>

        <Separator className="my-2" />

        {/* Costo empresa mensual */}
        <AccordionSection
          icon={<Shield className="h-4 w-4" />}
          label="Costo Empresa Mensual"
          value={resultados.costoTotalEmpresa}
          variant="total-header"
          isOpen={isOpen('mensual')}
          onToggle={() => toggle('mensual')}
          format={fmt}
        >
          <ResultRow label="Seguro Cesantía Empleador" value={resultados.cesantiaEmpleador} format={fmt} />
          <ResultRow label="Mutual" value={resultados.mutual} format={fmt} />
          <ResultRow label="SIS" value={resultados.sis} format={fmt} />
          <ResultRow label="Cotización Expectativa Vida" value={resultados.expectativaVida} format={fmt} />
          {resultados.afpEmpleador > 0 && (
            <ResultRow label="Aporte AFP Empleador" value={resultados.afpEmpleador} format={fmt} />
          )}
          {resultados.seguroComplementario > 0 && (
            <ResultRow label="Seguro Complementario Salud" value={resultados.seguroComplementario} format={fmt} />
          )}
          <ResultRow label="Total Costos Patronales" value={resultados.totalPatronal} variant="total" format={fmt} />
        </AccordionSection>

        {/* Costo empresa anual */}
        <AccordionSection
          icon={<Calendar className="h-4 w-4" />}
          label="Costo Empresa Anual"
          value={resultados.costoTotalEmpresaAnual}
          variant="anual"
          isOpen={isOpen('anual')}
          onToggle={() => toggle('anual')}
          format={fmt}
        >
          <ResultRow
            label="Costo mensual × 12"
            value={resultados.costoTotalEmpresa * 12}
            format={fmt}
          />
          <div className="mt-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Bonos Anuales
            </span>
          </div>
          <BonoAnualRow label="Bono Navidad" uf={7} bono={bonoNavidad} format={fmt} />
          <BonoAnualRow label="Bono Fiestas Patrias" uf={6} bono={bonoFiestasPatrias} format={fmt} />
          <BonoAnualRow label="Bono Escolaridad" uf={3} bono={bonoEscolaridad} format={fmt} />
          {bonoEmpresaAnual.montoImponible > 0 && (
            <BonoAnualRow label="Bono Empresa" bono={bonoEmpresaAnual} format={fmt} />
          )}
        </AccordionSection>
      </CardContent>
    </Card>
  )
}

function AccordionSection({ icon, label, value, variant, isOpen, onToggle, format, children }) {
  const valueClasses = {
    total: 'text-blue-600 dark:text-blue-400 font-semibold',
    'total-header': 'text-blue-600 dark:text-blue-400 font-bold',
    descuento: 'text-red-600 dark:text-red-400 font-semibold',
    anual: 'text-violet-600 dark:text-violet-400 font-bold',
  }
  const iconClasses = {
    total: 'text-blue-500',
    'total-header': 'text-blue-500',
    descuento: 'text-red-500',
    anual: 'text-violet-500',
  }

  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center justify-between py-1.5 group">
        <div className="flex items-center gap-2">
          <span className={iconClasses[variant]}>{icon}</span>
          <span className="text-sm font-semibold text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${valueClasses[variant]}`}>{format(value)}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      <div className={`grid transition-all duration-200 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="pl-6 pb-2 space-y-1 border-l-2 border-border ml-2 mt-1">{children}</div>
        </div>
      </div>
    </div>
  )
}

function BonoAnualRow({ label, uf, bono, format }) {
  return (
    <div className="py-0.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {label}
          {uf !== undefined && <span className="text-violet-500 font-medium"> ({uf} UF)</span>}
        </span>
        <span className="text-xs text-muted-foreground">{format(bono.montoImponible)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground pl-3">→ Costo empresa</span>
        <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
          {format(bono.costoEmpresa)}
        </span>
      </div>
    </div>
  )
}

function ResultRow({ label, value, variant = 'normal', format }) {
  const valueClasses = {
    normal: 'text-foreground',
    entrada: 'text-muted-foreground font-semibold',
    principal: 'text-primary font-bold text-lg',
    total: 'text-blue-600 dark:text-blue-400 font-semibold',
    'total-header': 'text-blue-600 dark:text-blue-400 font-bold text-lg',
    descuento: 'text-red-600 dark:text-red-400 font-semibold',
  }
  const labelClasses = {
    normal: 'text-xs text-muted-foreground',
    entrada: 'text-sm font-medium',
    principal: 'text-sm font-bold',
    total: 'text-xs font-semibold text-muted-foreground',
    'total-header': 'text-sm font-bold',
    descuento: 'text-xs font-semibold text-muted-foreground',
  }

  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={labelClasses[variant]}>{label}</span>
      <span className={valueClasses[variant]}>{format(value)}</span>
    </div>
  )
}
