import { useState } from 'react'
import { ChevronDown, Shield, TrendingDown, TrendingUp, Calendar, ListTree } from 'lucide-react'
import { Card, CardContent } from './ui/card'
import { Separator } from './ui/separator'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { formatCLP, formatUSD, formatPEN, formatBRL } from '../lib/utils'

export function Resultados({
  pais = 'chile',
  modo,
  resultados,
  moneda,
  onMonedaChange,
  dolarValue,
  afpData = {},
  afp,
  tasas = {},
  utilidadesError = null,
}) {
  const esPeru = pais === 'peru'
  const esBrasil = pais === 'brasil'
  const [openSections, setOpenSections] = useState(new Set())
  const [detallesOpen, setDetallesOpen] = useState(false)

  const toggle = (section) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const isOpen = (section) => openSections.has(section)

  const monedasDisponibles = esBrasil
    ? ['BRL', 'USD']
    : esPeru
      ? ['PEN', 'USD']
      : ['CLP', 'USD']
  const formatLocal = esBrasil ? formatBRL : esPeru ? formatPEN : formatCLP

  const fmt = (v) =>
    moneda === 'USD' && dolarValue > 0
      ? formatUSD(v / dolarValue)
      : formatLocal(v)

  const headerColor = 'bg-[#0c1a3a]'
  const headerTitle =
    modo === 'base_a_liquido' ? 'BASE → LÍQUIDO' : 'LÍQUIDO → BASE'

  const { bonoNavidad, bonoFiestasPatrias, bonoEscolaridad, bonoEmpresaAnual } = resultados

  // Tasa comisión AFP Peru (para etiqueta)
  const tasaComisionAFP = esPeru ? (afpData[afp] ?? 0) : 0

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
            {monedasDisponibles.map((cur) => (
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
        {dolarValue > 0 && (
          <p className="text-xs text-white/60 mt-1">1 USD = {formatLocal(dolarValue)}</p>
        )}
      </div>

      <CardContent className="p-4 space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
        {esBrasil && resultados.configError ? (
          <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 px-3 py-3">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              No se puede calcular Brasil
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 leading-relaxed">
              {resultados.configError}
            </p>
          </div>
        ) : (
        <>
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

        {/* Detalles (acordeón padre) */}
        <div>
          <button
            onClick={() => setDetallesOpen((v) => !v)}
            className="w-full flex items-center justify-between py-2 px-2 rounded-md bg-slate-100 dark:bg-slate-800/40 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ListTree className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                Detalles
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${detallesOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <div className={`grid transition-all duration-200 ease-in-out ${detallesOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <div className="pt-2 space-y-1">

        {esBrasil ? (
          <DetalleBrasil
            resultados={resultados}
            fmt={fmt}
            isOpen={isOpen}
            toggle={toggle}
          />
        ) : (
        <>
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
          {!esPeru && resultados.gratificacion > 0 && (
            <ResultRow label="Gratificación" value={resultados.gratificacion} format={fmt} />
          )}
          {esPeru && resultados.refrigerio > 0 && (
            <ResultRow label="Refrigerio" value={resultados.refrigerio} format={fmt} />
          )}
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
          {esPeru ? (
            <>
              <ResultRow label="AFP (10% obligatorio)" value={resultados.afpObligatorio} format={fmt} />
              <ResultRow
                label={`Comisión AFP (${(tasaComisionAFP * 100).toFixed(2)}%)`}
                value={resultados.comisionAFP}
                format={fmt}
              />
              <ResultRow label="Seguro invalidez (1.37%)" value={resultados.seguroInvalidez} format={fmt} />
              {resultados.impuesto > 0 && (
                <ResultRow label="Imp. 5ta categoría" value={resultados.impuesto} format={fmt} />
              )}
            </>
          ) : (
            <>
              <ResultRow label="Cotización Previsional (AFP)" value={resultados.cotizacionPrevisional} format={fmt} />
              <ResultRow label="Cotización Salud" value={resultados.cotizacionSalud} format={fmt} />
              <ResultRow label="Seguro Cesantía" value={resultados.cesantia} format={fmt} />
              {resultados.impuesto > 0 && (
                <ResultRow label="Impuesto Único" value={resultados.impuesto} format={fmt} />
              )}
            </>
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
          {esPeru ? (
            <>
              <ResultRow label="Sueldo Base" value={resultados.sueldoBase} format={fmt} />
              {resultados.refrigerio > 0 && (
                <ResultRow label="Refrigerio" value={resultados.refrigerio} format={fmt} />
              )}
              {resultados.bonosImponibles > 0 && (
                <ResultRow label="Bonos Imponibles" value={resultados.bonosImponibles} format={fmt} />
              )}
              {resultados.movilizacion > 0 && (
                <ResultRow label="Movilización" value={resultados.movilizacion} format={fmt} />
              )}
              {resultados.bonosNoImponibles > 0 && (
                <ResultRow label="Bonos No Imponibles" value={resultados.bonosNoImponibles} format={fmt} />
              )}
              <div className="mt-2 mb-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Aportes patronales
                </span>
              </div>
              {(resultados.aportesPatronales || []).map((a) => (
                <ResultRow key={a.id} label={a.nombre} value={a.monto} format={fmt} />
              ))}
              <ResultRow label="Total Costos Patronales" value={resultados.totalPatronal} variant="total" format={fmt} />
            </>
          ) : (
            <>
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
            </>
          )}
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
          <div className="flex items-center justify-between py-0.5">
            <span className="text-xs text-muted-foreground">Costo mensual × 12</span>
            <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
              {fmt(resultados.costoTotalEmpresa * 12)}
            </span>
          </div>
          {esPeru ? (
            <>
              <div className="mt-2 mb-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Gratificaciones (Jul + Dic)
                </span>
              </div>
              <div className="py-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Gratificaciones <span className="text-violet-500 font-medium">(2 sueldos base)</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{fmt(resultados.gratificacionesAnual)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground pl-3">
                    → Bonificación extraordinaria ({(resultados.tasaBonifExtraordinaria * 100).toFixed(2)}%)
                  </span>
                  <span className="text-xs text-muted-foreground">{fmt(resultados.bonificacionExtraordinaria)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground pl-3">→ Costo empresa</span>
                  <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                    {fmt(resultados.gratificacionesCostoAnual)}
                  </span>
                </div>
              </div>
              {bonoEmpresaAnual.montoImponible > 0 && (
                <>
                  <div className="mt-2 mb-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Bonos Anuales
                    </span>
                  </div>
                  <BonoAnualRow label="Bono Empresa" bono={bonoEmpresaAnual} format={fmt} />
                </>
              )}

              {utilidadesError ? (
                <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">
                  No se pudo estimar utilidades: {utilidadesError}
                </p>
              ) : (
                <>
                  {resultados.asignacionFamiliarAnual > 0 && (
                    <ResultRow
                      label="Asignación Familiar"
                      value={resultados.asignacionFamiliarAnual}
                      format={fmt}
                    />
                  )}
                  {resultados.canastaNavidena > 0 && (
                    <ResultRow label="Canasta Navideña" value={resultados.canastaNavidena} format={fmt} />
                  )}
                  {resultados.repartoUtilidades > 0 && (
                    <ResultRow
                      label="Reparto de Utilidades Estimado"
                      value={resultados.repartoUtilidades}
                      format={fmt}
                    />
                  )}
                  <Separator className="my-1.5" />
                  <ResultRow
                    label="Total Costo Empresa Anual"
                    value={resultados.costoTotalEmpresaAnual}
                    variant="total"
                    format={fmt}
                  />
                  {resultados.repartoUtilidades > 0 && (
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Utilidades estimadas según nómina activa y días registrados del año actual.
                    </p>
                  )}
                </>
              )}
            </>
          ) : (
            <>
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
            </>
          )}
        </AccordionSection>
        </>
        )}

              </div>
            </div>
          </div>
        </div>
        </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Detalle Brasil: misma secuencia de acordeones que Chile y Perú
 * (Total Haberes → Descuentos Trabajador → Costo Empresa Mensual →
 * Costo Empresa Anual), con los conceptos CLT y sus siglas legales.
 */
function DetalleBrasil({ resultados, fmt, isOpen, toggle }) {
  const metodoIRRF =
    resultados.metodoIRRF === 'simplificado' ? 'Descuento simplificado' : 'Deducciones legales'
  const bono = resultados.bonoEmpresaBrasil

  return (
    <>
      {/* 1. Haberes */}
      <AccordionSection
        icon={<TrendingUp className="h-4 w-4" />}
        label="Total Haberes"
        value={resultados.totalHaberes}
        variant="total"
        isOpen={isOpen('haberes')}
        onToggle={() => toggle('haberes')}
        format={fmt}
      >
        <ResultRow label="Sueldo Base Mensual" value={resultados.sueldoBase} format={fmt} />
      </AccordionSection>

      {/* 2. Descuentos */}
      <AccordionSection
        icon={<TrendingDown className="h-4 w-4" />}
        label="Descuentos Trabajador"
        value={resultados.totalDescuentos}
        variant="descuento"
        isOpen={isOpen('descuentos')}
        onToggle={() => toggle('descuentos')}
        format={fmt}
      >
        <ResultRow
          label="Cotización previsional trabajador (INSS)"
          value={resultados.inssTrabajador}
          format={fmt}
        />
        <ResultRow
          label="Impuesto a la renta retenido (IRRF)"
          value={resultados.irrfFinal}
          format={fmt}
        />
        <div className="flex items-center justify-between py-0.5">
          <span className="text-xs text-muted-foreground pl-3">→ Base de cálculo IRRF</span>
          <span className="text-xs text-muted-foreground">{fmt(resultados.baseIRRF)}</span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span className="text-xs text-muted-foreground pl-3">→ Método aplicado</span>
          <span className="text-xs text-muted-foreground">{metodoIRRF}</span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span className="text-xs text-muted-foreground pl-3">→ IRRF antes de reducción</span>
          <span className="text-xs text-muted-foreground">{fmt(resultados.irrfBruto)}</span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span className="text-xs text-muted-foreground pl-3">→ Reducción IRRF 2026</span>
          <span className="text-xs text-muted-foreground">{fmt(resultados.reduccionIRRF)}</span>
        </div>

        <Separator className="my-1.5" />

        <ResultRow
          label="Total Descuentos"
          value={resultados.totalDescuentos}
          variant="descuento"
          format={fmt}
        />
        <ResultRow
          label="Sueldo Líquido Mensual"
          value={resultados.sueldoLiquido}
          variant="total"
          format={fmt}
        />
      </AccordionSection>

      <Separator className="my-2" />

      {/* 3. Costo empresa mensual */}
      <AccordionSection
        icon={<Shield className="h-4 w-4" />}
        label="Costo Empresa Mensual"
        value={resultados.costoTotalEmpresa}
        variant="total-header"
        isOpen={isOpen('mensual')}
        onToggle={() => toggle('mensual')}
        format={fmt}
      >
        <ResultRow label="Sueldo Base" value={resultados.sueldoBase} format={fmt} />
        <ResultRow
          label="Cotización patronal (INSS patronal)"
          value={resultados.inssPatronal}
          format={fmt}
        />
        <ResultRow
          label="Riesgo ambiental del trabajo (RAT/FAP)"
          value={resultados.rat}
          format={fmt}
        />
        <ResultRow label="Contribuciones a terceros" value={resultados.terceros} format={fmt} />
        <ResultRow
          label="Fondo de Garantía por Tiempo de Servicio (FGTS)"
          value={resultados.fgts}
          format={fmt}
        />
        <ResultRow
          label="Total Cargas Patronales"
          value={resultados.totalEncargos}
          variant="total"
          format={fmt}
        />

        <Separator className="my-1.5" />

        <ResultRow label="Provisión de 13° sueldo" value={resultados.provision13} format={fmt} />
        <ResultRow
          label="Provisión de vacaciones"
          value={resultados.provisionVacaciones}
          format={fmt}
        />
        <ResultRow
          label="Adicional 1/3 de vacaciones"
          value={resultados.adicionalTercioVacaciones}
          format={fmt}
        />
        <ResultRow
          label="Total Provisiones"
          value={resultados.totalProvisiones}
          variant="total"
          format={fmt}
        />

        <Separator className="my-1.5" />

        <ResultRow
          label="Costo Empresa Mensual Total"
          value={resultados.costoTotalEmpresa}
          variant="total"
          format={fmt}
        />
      </AccordionSection>

      {/* 4. Costo empresa anual */}
      <AccordionSection
        icon={<Calendar className="h-4 w-4" />}
        label="Costo Empresa Anual"
        value={resultados.costoTotalEmpresaAnual}
        variant="anual"
        isOpen={isOpen('anual')}
        onToggle={() => toggle('anual')}
        format={fmt}
      >
        <div className="flex items-center justify-between py-0.5">
          <span className="text-xs text-muted-foreground">Costo mensual × 12</span>
          <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
            {fmt(resultados.costoEmpresaAnualSinBono)}
          </span>
        </div>

        {bono.monto > 0 && (
          <>
            <div className="mt-2 mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Bono Empresa Anual
              </span>
            </div>
            <ResultRow label="Bono empresa anual" value={bono.monto} format={fmt} />
            {bono.imponible && (
              <div className="flex items-center justify-between py-0.5">
                <span className="text-xs text-muted-foreground pl-3">
                  → Cargas patronales del bono
                </span>
                <span className="text-xs text-muted-foreground">{fmt(bono.cargas)}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-0.5">
              <span className="text-xs text-muted-foreground pl-3">→ Costo empresa</span>
              <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                {fmt(bono.costoEmpresa)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
              El bono empresa se estima como costo anual. El tratamiento tributario y
              laboral efectivo puede variar según su naturaleza, habitualidad y mes de pago.
            </p>
          </>
        )}

        <Separator className="my-1.5" />

        <ResultRow
          label="Costo Empresa Anual Total"
          value={resultados.costoTotalEmpresaAnual}
          variant="total"
          format={fmt}
        />
      </AccordionSection>

        
      
    </>
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
