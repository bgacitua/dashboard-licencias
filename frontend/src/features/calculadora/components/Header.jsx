import { Calculator, Globe, Moon, Sun } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

export function Header({ pais, onPaisChange, darkMode, onDarkModeToggle }) {
  return (
    <header className="bg-white border-b border-slate-200 shadow-navbar">
      <div className="max-w-7xl mx-auto px-6 py-3.5">
        <div className="flex items-center justify-between gap-4">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
              <Calculator className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-semibold text-slate-800 tracking-tight">
                Calculadora de Sueldos
              </h1>
              <p className="text-xs text-slate-400 font-medium">
                Remuneraciones y Costos Patronales
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-xs gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              EN LÍNEA
            </Badge>

            <Button
              variant="ghost"
              size="sm"
              onClick={onDarkModeToggle}
              className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
              <Globe className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <ToggleGroup
                type="single"
                value={pais}
                onValueChange={(v) => v && onPaisChange(v)}
                className="gap-1"
              >
                {[
                  { value: 'chile',  flag: '🇨🇱', label: 'Chile'  },
                  { value: 'peru',   flag: '🇵🇪', label: 'Perú'   },
                  { value: 'brasil', flag: '🇧🇷', label: 'Brasil' },
                ].map(({ value, flag, label }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className="h-8 px-3 text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 data-[state=on]:bg-primary data-[state=on]:text-white data-[state=on]:border-primary rounded-lg"
                  >
                    {flag} {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

        </div>
      </div>
    </header>
  )
}
