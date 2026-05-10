import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Button } from '../../calculadora/components/ui/button'

/**
 * Dropdown con multi-select y checkboxes. Patrón "pills con dropdown".
 *
 * Props:
 * - label: string a mostrar como placeholder cuando no hay nada seleccionado
 * - options: string[]
 * - value: string[]   (valores seleccionados)
 * - onChange: (values: string[]) => void
 * - disabled?: boolean
 * - searchable?: boolean   muestra un input de búsqueda en el dropdown
 * - width?: string         ancho extra (default 260px)
 */
export function MultiSelectDropdown({
  label,
  options,
  value = [],
  onChange,
  disabled = false,
  searchable = false,
  width = 'w-[260px]',
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return options
    return options.filter((o) => String(o).toLowerCase().includes(t))
  }, [options, q])

  useEffect(() => { if (!open) setQ('') }, [open])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const toggle = (opt) => {
    if (value.includes(opt)) onChange(value.filter((v) => v !== opt))
    else onChange([...value, opt])
  }

  const clear = (e) => {
    e.stopPropagation()
    onChange([])
  }

  const triggerLabel =
    value.length === 0
      ? `${label}: (Todas)`
      : value.length === 1
        ? `${label}: ${value[0]}`
        : `${label}: ${value.length} seleccionadas`

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="justify-between gap-2 min-w-[180px]"
      >
        <span className="truncate text-left text-xs font-normal">{triggerLabel}</span>
        <span className="flex items-center gap-1">
          {value.length > 0 && (
            <X
              className="size-3.5 opacity-60 hover:opacity-100"
              onClick={clear}
              role="button"
              aria-label="limpiar"
            />
          )}
          <ChevronDown className="size-3.5 opacity-60" />
        </span>
      </Button>

      {open && (
        <div className={`absolute z-30 mt-1 ${width} cx-card overflow-hidden`} style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
          {searchable && (
            <div className="p-1.5 cx-border border-b">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar…"
                className="cx-input w-full h-7 px-2 text-xs"
              />
            </div>
          )}
          <div className="max-h-[260px] overflow-y-auto p-1">
            {options.length === 0 && (
              <div className="text-xs cx-text-muted px-3 py-2">Sin opciones</div>
            )}
            {options.length > 0 && filtered.length === 0 && (
              <div className="text-xs cx-text-muted px-3 py-2">Sin resultados</div>
            )}
            {filtered.map((opt) => {
              const checked = value.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-xs rounded cx-row-hover cx-text-primary text-left"
                >
                  <span
                    className={`inline-flex size-4 items-center justify-center rounded border ${
                      checked ? 'border-transparent text-white' : 'cx-border'
                    }`}
                    style={checked ? { backgroundColor: 'var(--accent)' } : undefined}
                  >
                    {checked && <Check className="size-3" />}
                  </span>
                  <span className="truncate">{opt}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
