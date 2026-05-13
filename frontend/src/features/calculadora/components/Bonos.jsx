import { useState } from 'react'
import { Plus, Trash2, Gift } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { formatCLP, formatNumericInput, parseNumericInput } from '../lib/utils'

export function Bonos({ bonos, onAddBono, onRemoveBono }) {
  const [nombre, setNombre] = useState('')
  const [monto, setMonto] = useState('')
  const [imponible, setImponible] = useState(true)

  const handleAdd = () => {
    if (!nombre.trim() || !monto) return
    onAddBono({
      nombre: nombre.trim(),
      monto: parseNumericInput(monto),
      imponible,
    })
    setNombre('')
    setMonto('')
    setImponible(true)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary-soft flex items-center justify-center">
            <Gift className="h-4 w-4 text-primary" />
          </div>
          Bonos Adicionales
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Producción"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-600">Monto</Label>
            <Input
              value={monto}
              onChange={(e) => setMonto(formatNumericInput(e.target.value))}
              placeholder="$ 0"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              id="imponible"
              checked={imponible}
              onCheckedChange={(c) => setImponible(c === true)}
            />
            <Label htmlFor="imponible" className="text-sm cursor-pointer text-slate-700">
              Imponible
            </Label>
          </div>
          <Button
            onClick={handleAdd}
            size="sm"
            className="bg-primary hover:bg-primary-hover text-white"
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>

        {bonos.length > 0 && (
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-1.5 max-h-36 overflow-y-auto">
            {bonos.map((bono, i) => (
              <div key={bono.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">
                  {i + 1}. {bono.nombre} · {formatCLP(bono.monto)} ·{' '}
                  <span className={bono.imponible ? 'text-primary font-medium' : 'text-amber-600 font-medium'}>
                    {bono.imponible ? 'Imponible' : 'No imponible'}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveBono(bono.id)}
                  className="h-6 w-6 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
