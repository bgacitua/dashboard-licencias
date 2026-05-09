import { Building2, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { formatCLP, formatNumericInput } from '../lib/utils'

export function DatosPrincipales({
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
}) {
  const tasaAFP = afpData[afp] || 0.1049
  const tipoObj = bonosEmpresa.find((b) => b.id === bonoEmpresaTipo)
  const tasaArr = tipoObj?.tasa
  const esMontoFijo = !Array.isArray(tasaArr) || tasaArr.length === 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          Datos Principales
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Sueldo Principal */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">
            {modo === 'liquido_a_base' ? 'Sueldo Líquido Deseado' : 'Sueldo Base'}
          </Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={sueldo}
              onChange={(e) => onSueldoChange(formatNumericInput(e.target.value))}
              placeholder={modo === 'liquido_a_base' ? 'Ej: 1.000.000' : 'Ej: 1.500.000'}
              className="pl-10 h-12 text-lg"
            />
          </div>
        </div>

        {/* AFP */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">AFP</Label>
          <div className="flex gap-3">
            <Select value={afp} onValueChange={onAfpChange}>
              <SelectTrigger className="flex-1 h-11">
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
            <Badge variant="secondary" className="h-11 px-4 flex items-center text-sm">
              {(tasaAFP * 100).toFixed(2)}%
            </Badge>
          </div>
        </div>

        {/* Sistema de Salud */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Sistema de Salud</Label>
          <RadioGroup
            value={sistemaSalud}
            onValueChange={(v) => onSistemaSaludChange(v)}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="fonasa" id="fonasa" />
              <Label htmlFor="fonasa" className="cursor-pointer">
                Fonasa
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="isapre" id="isapre" />
              <Label htmlFor="isapre" className="cursor-pointer">
                Isapre
              </Label>
            </div>
          </RadioGroup>

          {sistemaSalud === 'isapre' && (
            <div className="flex items-center gap-3 mt-2">
              <Label className="text-sm">UF:</Label>
              <Input
                type="text"
                value={saludUF}
                onChange={(e) => onSaludUFChange(e.target.value)}
                placeholder="Ej: 3.5"
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                ({formatCLP(parseFloat(saludUF || '0') * (ufValue || 0))})
              </span>
            </div>
          )}
        </div>

        {/* Movilización */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Movilización</Label>
          <Input
            type="text"
            value={movilizacion}
            onChange={(e) => onMovilizacionChange(formatNumericInput(e.target.value))}
            placeholder="Ej: 40.000"
            className="h-11"
          />
        </div>

        {/* Bono Empresa */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Bono Empresa</Label>
          <Select value={bonoEmpresaTipo} onValueChange={onBonoEmpresaTipoChange}>
            <SelectTrigger className="h-11">
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
            <div className="flex gap-3">
              <Select
                value={String(bonoEmpresaTasaIdx)}
                onValueChange={(v) => onBonoEmpresaTasaIdxChange(Number(v))}
              >
                <SelectTrigger className="flex-1 h-11">
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
            </div>
          )}
          {esMontoFijo ? (
            <Input
              type="text"
              value={bonoEmpresaMonto}
              onChange={(e) => onBonoEmpresaMontoChange(formatNumericInput(e.target.value))}
              placeholder="Ej: 600.000"
              className="h-11"
            />
          ) : (
            <div className="h-11 flex items-center px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
              {formatCLP(bonoEmpresaComputado)}
              <span className="ml-2 text-xs opacity-70">(calculado sobre sueldo base)</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
