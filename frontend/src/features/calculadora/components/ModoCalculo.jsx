import { Calculator } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

export function ModoCalculo({ modo, onModoChange }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-5 w-5 text-blue-600" />
          Modo de Cálculo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          type="single"
          value={modo}
          onValueChange={(v) => v && onModoChange(v)}
          className="w-full"
        >
          <ToggleGroupItem
            value="liquido_a_base"
            className="flex-1 data-[state=on]:bg-emerald-600 data-[state=on]:text-white h-12"
          >
            Líquido → Base
          </ToggleGroupItem>
          <ToggleGroupItem
            value="base_a_liquido"
            className="flex-1 data-[state=on]:bg-blue-600 data-[state=on]:text-white h-12"
          >
            Base → Líquido
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-sm text-muted-foreground mt-3">
          💡{' '}
          {modo === 'liquido_a_base'
            ? 'Ingresa el sueldo líquido deseado y calcula el sueldo base necesario'
            : 'Ingresa el sueldo base y calcula el sueldo líquido resultante'}
        </p>
      </CardContent>
    </Card>
  )
}
