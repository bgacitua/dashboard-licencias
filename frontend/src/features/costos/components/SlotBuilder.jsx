import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '../../calculadora/components/ui/button'
import { SearchableSelect } from './SearchableSelect'
import { AutocompleteInput } from './AutocompleteInput'
import CostosService from '../../../services/costos.service'

/**
 * Mini wizard inline para crear un slot de comparación.
 * Tipos: area | jefatura | cargo | persona.
 *
 * Props:
 * - nextLetter: 'A' | 'B' | 'C' | 'D'
 * - onConfirm(slot)
 * - onCancel()
 */
export function SlotBuilder({ nextLetter, onConfirm, onCancel }) {
  const [tipo, setTipo] = useState('area')

  // Para slot tipo "area" cargamos dimensiones.
  const [empresas, setEmpresas] = useState([])
  const [empresa, setEmpresa] = useState(null)
  const [areas, setAreas] = useState([])
  const [area, setArea] = useState(null)
  // Para slot tipo "cargo".
  const [cargos, setCargos] = useState([])
  const [cargo, setCargo] = useState(null)
  // Para tipos jefatura / persona.
  const [jefe, setJefe] = useState(null)
  const [persona, setPersona] = useState(null)

  useEffect(() => {
    if (tipo === 'area' || tipo === 'cargo') {
      CostosService.getDimensiones().then((d) => {
        setEmpresas(d.empresas)
        setCargos(d.cargos)
      }).catch(() => {})
    }
  }, [tipo])

  useEffect(() => {
    if (tipo !== 'area' || !empresa) { setAreas([]); return }
    CostosService.getDimensiones({ empresas: [empresa] })
      .then((d) => setAreas(d.areas))
      .catch(() => {})
  }, [tipo, empresa])

  // ¿Slot listo para confirmar?
  const valido = (() => {
    if (tipo === 'area') return !!(empresa && area)
    if (tipo === 'cargo') return !!cargo
    if (tipo === 'jefatura') return !!jefe
    if (tipo === 'persona') return !!persona
    return false
  })()

  const confirmar = () => {
    if (!valido) return
    let slot
    if (tipo === 'area') {
      slot = { tipo, valor: { empresa, area }, label: `${area} (${empresa})` }
    } else if (tipo === 'cargo') {
      slot = { tipo, valor: { name_role: cargo }, label: cargo }
    } else if (tipo === 'jefatura') {
      slot = {
        tipo,
        valor: { rut: jefe.rut, full_name: jefe.label },
        label: jefe.label,
      }
    } else {
      slot = {
        tipo,
        valor: { rut: persona.rut, full_name: persona.label },
        label: persona.label,
      }
    }
    onConfirm(slot)
  }

  const tabs = [
    { key: 'area', label: 'Área' },
    { key: 'jefatura', label: 'Jefatura' },
    { key: 'cargo', label: 'Cargo' },
    { key: 'persona', label: 'Persona' },
  ]

  return (
    <div className="cx-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold cx-text-primary">
          Nuevo slot {nextLetter && <span className="cx-text-secondary">· {nextLetter}</span>}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="cx-text-secondary hover:cx-text-primary transition-colors"
          aria-label="cancelar"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex gap-1.5">
        {tabs.map((t) => (
          <Button
            key={t.key}
            type="button"
            size="sm"
            variant={tipo === t.key ? 'default' : 'outline'}
            onClick={() => setTipo(t.key)}
            className="h-7 px-2.5 text-xs"
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tipo === 'area' && (
          <>
            <SearchableSelect
              label="Empresa"
              options={empresas}
              value={empresa}
              onChange={(v) => { setEmpresa(v); setArea(null) }}
            />
            <SearchableSelect
              label="Área"
              options={areas}
              value={area}
              onChange={setArea}
              disabled={!empresa}
            />
          </>
        )}
        {tipo === 'cargo' && (
          <SearchableSelect
            label="Cargo"
            options={cargos}
            value={cargo}
            onChange={setCargo}
          />
        )}
        {tipo === 'jefatura' && (
          <AutocompleteInput
            placeholder="Buscar jefatura…"
            value={jefe}
            onChange={setJefe}
            search={(q) => CostosService.buscarJefes(q)}
            getKey={(it) => it.rut}
            getLabel={(it) => it.full_name}
            getRut={(it) => it.rut}
            renderItem={(it) => (
              <div>
                <div className="font-medium">{it.full_name}</div>
                <div className="text-[10px] cx-text-secondary">
                  {it.name_role} · {it.empresa || '—'}
                </div>
              </div>
            )}
          />
        )}
        {tipo === 'persona' && (
          <AutocompleteInput
            placeholder="Buscar persona…"
            value={persona}
            onChange={setPersona}
            search={(q) => CostosService.buscarPersonas(q)}
            getKey={(it) => it.rut}
            getLabel={(it) => it.full_name}
            getRut={(it) => it.rut}
            renderItem={(it) => (
              <div>
                <div className="font-medium">{it.full_name}</div>
                <div className="text-[10px] cx-text-secondary">
                  {it.cargo || '—'} · {it.empresa || '—'}
                </div>
              </div>
            )}
          />
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} className="h-7 text-xs">
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={confirmar}
          disabled={!valido}
          className="h-7 text-xs gap-1"
        >
          <Check className="size-3.5" />
          Agregar
        </Button>
      </div>
    </div>
  )
}
