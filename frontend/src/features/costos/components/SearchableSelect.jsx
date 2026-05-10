import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Button } from '../../calculadora/components/ui/button'

/**
 * Single-select con búsqueda. Reemplaza al Select cuando la lista es larga.
 *
 * Props:
 * - label: string (etiqueta del trigger cuando no hay selección)
 * - options: string[]
 * - value: string | null
 * - onChange: (value: string | null) => void
 * - disabled?: boolean
 * - emptyLabel?: string  (texto cuando lista filtrada queda vacía)
 */
export function SearchableSelect({
  label,
  options = [],
  value,
  onChange,
  disabled = false,
  emptyLabel = 'Sin resultados',
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (open) {
      // pequeño delay para que el input esté montado
      setTimeout(() => inputRef.current?.focus(), 10)
    } else {
      setQ('')
    }
  }, [open])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return options
    return options.filter((o) => String(o).toLowerCase().includes(t))
  }, [options, q])

  const triggerLabel = value ? `${label}: ${value}` : `${label}: (Todos)`

  const clear = (e) => {
    e.stopPropagation()
    onChange(null)
  }

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
          {value && (
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
        <div className="absolute z-30 mt-1 w-[280px] cx-card overflow-hidden" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
          <div className="p-1.5 cx-border border-b">
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="cx-input w-full h-7 px-2 text-xs"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className={`flex w-full items-center px-2 py-1.5 text-xs rounded-sm text-left ${
                !value ? 'cx-bg-input cx-text-primary font-medium' : 'cx-row-hover'
              }`}
            >
              (Todos)
            </button>
            {filtered.length === 0 && (
              <div className="px-2 py-2 text-xs cx-text-muted">{emptyLabel}</div>
            )}
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt)
                  setOpen(false)
                }}
                className={`flex w-full items-center px-2 py-1.5 text-xs rounded-sm text-left truncate ${
                  value === opt ? 'cx-bg-input cx-text-primary font-medium' : 'cx-row-hover'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
