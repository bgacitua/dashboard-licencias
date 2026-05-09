import { Calculator, Globe, Moon, Sun } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

export function Header({ pais, onPaisChange, darkMode, onDarkModeToggle }) {
  return (
    <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calculator className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Calculadora de Sueldos</h1>
              <p className="text-blue-100 text-sm">
                Remuneraciones y Costos Patronales
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Badge className="!bg-emerald-500 text-white border-transparent">
              <span className="h-2 w-2 bg-white rounded-full mr-2 animate-pulse" />
              ONLINE
            </Badge>

            <Button
              variant="ghost"
              size="sm"
              onClick={onDarkModeToggle}
              className="text-white hover:bg-white/20 hover:text-white h-9 w-9 p-0"
              aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-200" />
              <ToggleGroup
                type="single"
                value={pais}
                onValueChange={(v) => v && onPaisChange(v)}
              >
                <ToggleGroupItem
                  value="chile"
                  className="data-[state=on]:bg-amber-400 data-[state=on]:text-black text-white border-white/30"
                >
                  🇨🇱 Chile
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="peru"
                  className="data-[state=on]:bg-amber-400 data-[state=on]:text-black text-white border-white/30"
                >
                  🇵🇪 Perú
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="brasil"
                  className="data-[state=on]:bg-amber-400 data-[state=on]:text-black text-white border-white/30"
                >
                  🇧🇷 Brasil
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
