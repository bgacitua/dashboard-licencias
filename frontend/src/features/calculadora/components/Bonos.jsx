import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="h-5 w-5 text-emerald-600" />
          Bonos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Producción"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Monto</Label>
            <Input
              value={monto}
              onChange={(e) => setMonto(formatNumericInput(e.target.value))}
              placeholder="$ 0"
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
            <Label htmlFor="imponible" className="text-sm cursor-pointer">
              Imponible
            </Label>
          </div>
          <Button onClick={handleAdd} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>

        {bonos.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3 space-y-2 max-h-32 overflow-y-auto">
            {bonos.map((bono, i) => (
              <div key={bono.id} className="flex items-center justify-between text-sm">
                <span>
                  {i + 1}. {bono.nombre} | {formatCLP(bono.monto)} |
                  <span className={bono.imponible ? 'text-blue-600' : 'text-orange-600'}>
                    {' '}
                    {bono.imponible ? 'IMPONIBLE' : 'NO IMPONIBLE'}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveBono(bono.id)}
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
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
