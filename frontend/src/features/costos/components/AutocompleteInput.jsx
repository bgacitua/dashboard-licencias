import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

/**
 * Input con autocomplete debounced. Genérico para personas o jefes.
 *
 * Props:
 * - placeholder: string
 * - value: { rut, label } | null
 * - onChange: (item|null) => void
 * - search: (q: string) => Promise<Array>
 * - renderItem: (item) => ReactNode
 * - getKey: (item) => string
 * - getLabel: (item) => string
 * - getRut: (item) => string
 * - debounceMs?: number (default 300)
 * - disabled?: boolean
 */
export function AutocompleteInput({
  placeholder,
  value,
  onChange,
  search,
  renderItem,
  getKey,
  getLabel,
  getRut,
  debounceMs = 300,
  disabled = false,
}) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([])
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const data = await search(q.trim())
        if (!cancelled) setItems(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, search, debounceMs])

  const select = (item) => {
    onChange({ rut: getRut(item), label: getLabel(item), raw: item })
    setQ('')
    setOpen(false)
  }

  const clear = () => {
    onChange(null)
    setQ('')
  }

  // Si hay valor seleccionado, mostrar pill; si no, mostrar input.
  if (value?.rut) {
    return (
      <div className="flex w-full items-center justify-between gap-2 rounded-md cx-border border cx-bg-input px-3 h-8 text-xs cx-text-primary">
        <span className="truncate font-medium">{value.label}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={clear}
          className="cx-text-secondary hover:cx-text-primary transition-colors"
          aria-label="quitar"
        >
          <X className="size-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative w-full" ref={ref}>
      <input
        type="text"
        placeholder={placeholder}
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        className="cx-input h-8 text-xs w-full px-3"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full max-h-[280px] overflow-y-auto cx-card" style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
          {loading && (
            <div className="px-3 py-2 text-xs cx-text-muted">Buscando…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-xs cx-text-muted">Sin resultados</div>
          )}
          {!loading &&
            items.map((it) => (
              <button
                key={getKey(it)}
                type="button"
                onClick={() => select(it)}
                className="flex w-full items-start gap-2 px-3 py-2 text-xs cx-row-hover cx-text-primary text-left"
              >
                {renderItem(it)}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
