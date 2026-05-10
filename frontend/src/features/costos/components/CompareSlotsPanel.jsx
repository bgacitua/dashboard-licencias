import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '../../calculadora/components/ui/button'
import { SLOT_COLORS } from '../lib/useCompareSlots'
import { SlotBuilder } from './SlotBuilder'

const TIPO_LABEL = {
  area: 'Área',
  jefatura: 'Jefatura',
  cargo: 'Cargo',
  persona: 'Persona',
}

export function CompareSlotsPanel({ slots, onAdd, onRemove, onClearAll, nextLetter, canAdd }) {
  const [building, setBuilding] = useState(false)

  return (
    <div className="cx-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold cx-text-primary">
          Comparación
          <span className="cx-text-secondary font-normal ml-2 text-xs">
            ({slots.length}/4)
          </span>
        </div>
        {slots.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-7 px-2 text-xs"
          >
            Salir de comparación
          </Button>
        )}
      </div>

      {slots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => (
            <div
              key={s.id}
              className="inline-flex items-center gap-2 rounded-md cx-border border cx-bg-input cx-text-primary px-2 py-1.5 text-xs"
            >
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold text-white"
                style={{ backgroundColor: SLOT_COLORS[s.id] }}
              >
                {s.id}
              </span>
              <span className="cx-text-secondary">{TIPO_LABEL[s.tipo]}:</span>
              <span className="font-medium truncate max-w-[200px] cx-text-primary">{s.label}</span>
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                className="opacity-60 hover:opacity-100"
                aria-label="quitar slot"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {building ? (
        <SlotBuilder
          nextLetter={nextLetter}
          onConfirm={(slot) => {
            onAdd(slot)
            setBuilding(false)
          }}
          onCancel={() => setBuilding(false)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd}
          onClick={() => setBuilding(true)}
          className="h-8 gap-1.5"
        >
          <Plus className="size-3.5" />
          {slots.length === 0 ? 'Comparar' : `Agregar slot ${nextLetter}`}
        </Button>
      )}
    </div>
  )
}
