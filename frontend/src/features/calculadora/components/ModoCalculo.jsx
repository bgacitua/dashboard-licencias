import { Calculator } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

export function ModoCalculo({ modo, onModoChange }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary-soft flex items-center justify-center">
            <Calculator className="h-4 w-4 text-primary" />
          </div>
          Modo de Cálculo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          type="single"
          value={modo}
          onValueChange={(v) => v && onModoChange(v)}
          className="w-full gap-2"
        >
          <ToggleGroupItem
            value="liquido_a_base"
            className="flex-1 h-11 text-sm font-semibold border border-slate-200 rounded-xl text-slate-600
              data-[state=on]:bg-primary data-[state=on]:text-white data-[state=on]:border-primary
              hover:bg-slate-50"
          >
            Líquido → Base
          </ToggleGroupItem>
          <ToggleGroupItem
            value="base_a_liquido"
            className="flex-1 h-11 text-sm font-semibold border border-slate-200 rounded-xl text-slate-600
              data-[state=on]:bg-primary data-[state=on]:text-white data-[state=on]:border-primary
              hover:bg-slate-50"
          >
            Base → Líquido
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          {modo === 'liquido_a_base'
            ? '💡 Ingresa el sueldo líquido deseado y calcula el sueldo base necesario.'
            : '💡 Ingresa el sueldo base y calcula el sueldo líquido resultante.'}
        </p>
      </CardContent>
    </Card>
  )
}
