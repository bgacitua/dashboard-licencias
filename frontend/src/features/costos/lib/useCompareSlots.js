// features/costos/lib/useCompareSlots.js
import { useCallback, useMemo, useState } from 'react'

// Colores fijos por slot.
export const SLOT_COLORS = {
  A: '#185FA5',
  B: '#0F6E56',
  C: '#BA7517',
  D: '#993556',
}

const SLOT_LETTERS = ['A', 'B', 'C', 'D']

/**
 * Maneja una lista de hasta 4 slots con letras estables (A/B/C/D).
 * Al quitar un slot, los demás conservan su letra (no se reordenan).
 */
export function useCompareSlots() {
  const [slots, setSlots] = useState([])

  // Letra disponible para el próximo slot (A/B/C/D, en orden, sin reusar).
  // Es un valor — no una función — para poder interpolarlo en JSX/strings.
  const nextLetter = useMemo(() => {
    const used = new Set(slots.map((s) => s.id))
    return SLOT_LETTERS.find((l) => !used.has(l)) ?? null
  }, [slots])

  const add = useCallback((slot) => {
    setSlots((prev) => {
      if (prev.length >= 4) return prev
      const used = new Set(prev.map((s) => s.id))
      const id = SLOT_LETTERS.find((l) => !used.has(l))
      if (!id) return prev
      return [...prev, { ...slot, id, color: SLOT_COLORS[id] }]
    })
  }, [])

  const remove = useCallback((id) => {
    setSlots((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const clear = useCallback(() => setSlots([]), [])

  return { slots, add, remove, clear, nextLetter, canAdd: slots.length < 4 }
}
