import { Building2, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { Checkbox } from './ui/checkbox'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { formatBRL, formatBRLInput, formatCLP, formatNumericInput, formatPEN } from '../lib/utils'

export function DatosPrincipales({
  pais = 'chile',
  modo,
  sueldo,
  onSueldoChange,
  afp,
  onAfpChange,
  sistemaSalud,
  onSistemaSaludChange,
  saludUF,
  onSaludUFChange,
  movilizacion,
  onMovilizacionChange,
  bonoEmpresaTipo,
  onBonoEmpresaTipoChange,
  bonoEmpresaTasaIdx,
  onBonoEmpresaTasaIdxChange,
  bonoEmpresaMonto,
  onBonoEmpresaMontoChange,
  bonoEmpresaComputado,
  bonosEmpresa,
  afpData,
  ufValue,
  // Perú — utilidades
  rentaImponible,
  onRentaImponibleChange,
  porcentajeUtilidades,
  onPorcentajeUtilidadesChange,
  tieneAsignacionFamiliar,
  onTieneAsignacionFamiliarChange,
  utilidades,
}) {
  const esPeru = pais === 'peru'
  const esBrasil = pais === 'brasil'

  // Brasil escribe con separadores brasileños: se guarda el texto tal cual
  // mientras se escribe (evita saltos de cursor) y se normaliza al salir.
  const onMontoChange = (setter) => (e) =>
    setter(esBrasil ? e.target.value : formatNumericInput(e.target.value))
  const onMontoBlur = (valor, setter) => () => {
    if (esBrasil) setter(formatBRLInput(valor))
  }
  const tasaAFPDefault = esPeru ? 0.0155 : 0.1049
  const tasaAFP = afpData[afp] || tasaAFPDefault
  const tipoObj = bonosEmpresa.find((b) => b.id === bonoEmpresaTipo)
  const tasaArr = tipoObj?.tasa
  const esMontoFijo = !Array.isArray(tasaArr) || tasaArr.length === 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary-soft flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          Datos Principales
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Sueldo principal */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">
            {modo === 'liquido_a_base' ? 'Sueldo Líquido Deseado' : 'Sueldo Base'}
          </Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              inputMode="decimal"
              value={sueldo}
              onChange={onMontoChange(onSueldoChange)}
              onBlur={onMontoBlur(sueldo, onSueldoChange)}
              placeholder={esBrasil ? 'Ej: 25.500,50' : modo === 'liquido_a_base' ? 'Ej: 1.000.000' : 'Ej: 1.500.000'}
              className="pl-10 h-12 text-lg font-semibold"
            />
          </div>
        </div>

        {/* Brasil — bono empresa anual */}
        {esBrasil && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">
                Bono Empresa (anual)
              </Label>
              <Select value={bonoEmpresaTipo} onValueChange={onBonoEmpresaTipoChange}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Tipo de bono" />
                </SelectTrigger>
                <SelectContent>
                  {bonosEmpresa.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {Array.isArray(tasaArr) && tasaArr.length > 0 ? (
                <>
                  <Select
                    value={String(bonoEmpresaTasaIdx)}
                    onValueChange={(v) => onBonoEmpresaTasaIdxChange(Number(v))}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Porcentaje del sueldo base" />
                    </SelectTrigger>
                    <SelectContent>
                      {tasaArr.map((t, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {(t * 100).toFixed(0)}% del sueldo base
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="h-10 flex items-center px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
                    {formatBRL(bonoEmpresaComputado)}
                    <span className="ml-2 text-xs text-slate-400">(calculado sobre base)</span>
                  </div>
                </>
              ) : (
                <Input
                  type="text"
                  inputMode="decimal"
                  value={bonoEmpresaMonto}
                  onChange={onMontoChange(onBonoEmpresaMontoChange)}
                  onBlur={onMontoBlur(bonoEmpresaMonto, onBonoEmpresaMontoChange)}
                  placeholder="Ej: 10.000,00"
                  className="h-10"
                />
              )}

              <p className="text-[11px] leading-relaxed text-slate-500">
                {tipoObj?.imponible
                  ? 'Imponible: suma sus cargas patronales al costo anual.'
                  : 'No imponible: sólo suma el monto del bono al costo anual.'}
              </p>
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-lg px-3 py-2">
              Estimación CLT para remuneración fija. No incluye beneficios, convenio
              colectivo, Simples Nacional, CPRB, desvinculación ni remuneración variable.
            </p>
          </>
        )}

        {/* AFP */}
        {!esBrasil && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">
            {esPeru ? 'AFP (Administradora)' : 'AFP'}
          </Label>
          <div className="flex gap-2">
            <Select value={afp} onValueChange={onAfpChange}>
              <SelectTrigger className="flex-1 h-10">
                <SelectValue placeholder="Selecciona AFP" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(afpData).map((afpName) => (
                  <SelectItem key={afpName} value={afpName}>
                    {afpName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge
              variant="secondary"
              className="h-10 px-3 flex items-center text-xs font-semibold bg-primary-soft text-primary border-0"
            >
              {esPeru ? `10% + ${(tasaAFP * 100).toFixed(2)}%` : `${(tasaAFP * 100).toFixed(2)}%`}
            </Badge>
          </div>
          {esPeru && (
            <p className="text-[11px] text-slate-500">
              Aporte obligatorio 10% + comisión variable de la AFP.
            </p>
          )}
        </div>
        )}

        {/* Sistema de Salud */}
        {!esBrasil && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-600">Sistema de Salud</Label>
          {esPeru ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-800/40 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  EsSalud
                </span>
                <Badge
                  variant="secondary"
                  className="text-[11px] font-semibold bg-primary-soft text-primary border-0"
                >
                  9% empleador
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Cobertura obligatoria.
              </p>
            </div>
          ) : (
            <>
              <RadioGroup
                value={sistemaSalud}
                onValueChange={(v) => onSistemaSaludChange(v)}
                className="flex gap-4"
              >
                {[
                  { value: 'fonasa', label: 'Fonasa' },
                  { value: 'isapre', label: 'Isapre' },
                ].map(({ value, label }) => (
                  <div key={value} className="flex items-center space-x-2">
                    <RadioGroupItem value={value} id={value} />
                    <Label htmlFor={value} className="cursor-pointer text-sm text-slate-700">
                      {label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              {sistemaSalud === 'isapre' && (
                <div className="flex items-center gap-2 mt-2">
                  <Label className="text-xs font-medium text-slate-600 whitespace-nowrap">UF a pagar:</Label>
                  <Input
                    type="text"
                    value={saludUF}
                    onChange={(e) => onSaludUFChange(e.target.value)}
                    placeholder="Ej: 3.5"
                    className="w-24 h-9"
                  />
                  <span className="text-xs text-slate-500">
                    ({formatCLP(parseFloat(saludUF || '0') * (ufValue || 0))})
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        )}

        {/* Movilización */}
        {!esBrasil && !esPeru && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">Movilización</Label>
          <Input
            type="text"
            value={movilizacion}
            onChange={(e) => onMovilizacionChange(formatNumericInput(e.target.value))}
            placeholder="Ej: 40.000"
            className="h-10"
          />
        </div>
        )}

        {/* Asignación familiar (Perú) */}
        {esPeru && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="asignacion-familiar"
              checked={tieneAsignacionFamiliar}
              onCheckedChange={(v) => onTieneAsignacionFamiliarChange(v === true)}
            />
            <Label htmlFor="asignacion-familiar" className="cursor-pointer text-sm text-slate-700 dark:text-slate-200">
              Tiene asignación familiar
            </Label>
          </div>
        )}

        {/* Bono Empresa */}
        {!esBrasil && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-600">
            {esPeru ? 'Bono Empresa (anual — utilidades / bono gestión)' : 'Bono Empresa'}
          </Label>
          <Select value={bonoEmpresaTipo} onValueChange={onBonoEmpresaTipoChange}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Tipo de bono" />
            </SelectTrigger>
            <SelectContent>
              {bonosEmpresa.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {Array.isArray(tasaArr) && tasaArr.length > 0 && (
            <Select
              value={String(bonoEmpresaTasaIdx)}
              onValueChange={(v) => onBonoEmpresaTasaIdxChange(Number(v))}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Tasa" />
              </SelectTrigger>
              <SelectContent>
                {tasaArr.map((t, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {(t * 100).toFixed(0)}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {esMontoFijo ? (
            <Input
              type="text"
              value={bonoEmpresaMonto}
              onChange={(e) => onBonoEmpresaMontoChange(formatNumericInput(e.target.value))}
              placeholder="Ej: 600.000"
              className="h-10"
            />
          ) : (
            <div className="h-10 flex items-center px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
              {formatCLP(bonoEmpresaComputado)}
              <span className="ml-2 text-xs text-slate-400">(calculado sobre base)</span>
            </div>
          )}
        </div>
        )}

        {/* Perú — utilidades / asignación familiar */}
        {esPeru && (
          <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">
                Renta imponible proyectada de la empresa
              </Label>
              <Input
                type="text"
                value={rentaImponible}
                onChange={(e) => onRentaImponibleChange(formatNumericInput(e.target.value))}
                placeholder="Ej: 500.000"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-600">
                Porcentaje de utilidades
              </Label>
              <div className="relative w-32">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={porcentajeUtilidades}
                  onChange={(e) => onPorcentajeUtilidadesChange(e.target.value)}
                  className="h-10 pr-7"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-[11px] text-slate-500">Sueldos anuales actuales</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {utilidades ? formatPEN(utilidades.empresa_sueldos_actual_anual) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Días trabajados del año actual</p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {utilidades
                    ? utilidades.empresa_dias_actual.toLocaleString('es-PE')
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  )
}
