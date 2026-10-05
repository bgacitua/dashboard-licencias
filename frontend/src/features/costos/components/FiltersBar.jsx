import { useCallback, useEffect, useState } from 'react'
import { Filter, RotateCcw } from 'lucide-react'
import { Button } from '../../calculadora/components/ui/button'
import { MultiSelectDropdown } from './MultiSelectDropdown'
import { AutocompleteInput } from './AutocompleteInput'
import { PeriodPicker } from './PeriodPicker'
import CostosService from '../../../services/costos.service'

/**
 * Barra de filtros del módulo Costos.
 * - Empresa, subárea, área, C. costo y cargo: multi-select con filtrado cruzado
 *   (cada lista respeta los demás filtros pero no el propio).
 * - Autocomplete: jefatura, persona.
 * - Período: picker con presets.
 */
export function FiltersBar({ filtros, setFiltros, onReset, disabled = false }) {
  const [dim, setDim] = useState({
    empresas: [],
    areas: [],
    subareas: [],
    centros_costo: [],
    cargos: [],
  })

  // Keys estables para los useEffect/useCallback (las arrays cambian identidad cada render).
  const empresasKey = (filtros.empresas || []).join('|')
  const areasKey = (filtros.areas || []).join('|')
  const subareasKey = (filtros.subareas || []).join('|')
  const cargosKey = (filtros.cargos || []).join('|')

  // Recargar dimensiones cuando cambia la cascada.
  useEffect(() => {
    let cancelled = false
    CostosService.getDimensiones({
      pais: filtros.pais,
      empresas: filtros.empresas,
      areas: filtros.areas,
      subareas: filtros.subareas,
      cargos: filtros.cargos,
    })
      .then((d) => {
        if (cancelled) return
        setDim(d)
        // Quita selecciones que dejaron de ser válidas por otro filtro
        // (p. ej. un área que no pertenece a las empresas ahora elegidas).
        setFiltros((prev) => {
          const podar = (arr, opciones) => {
            const ok = (arr || []).filter((v) => opciones.includes(v))
            return ok.length === (arr || []).length ? arr : ok
          }
          const next = {
            empresas: podar(prev.empresas, d.empresas),
            areas: podar(prev.areas, d.areas),
            subareas: podar(prev.subareas, d.subareas),
            centros_costo: podar(prev.centros_costo, d.centros_costo),
            cargos: podar(prev.cargos, d.cargos),
          }
          const cambio = Object.keys(next).some((k) => next[k] !== prev[k])
          return cambio ? { ...prev, ...next } : prev
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [filtros.pais, empresasKey, areasKey, subareasKey, cargosKey])

  // Búsqueda de jefes restringida por los filtros organizacionales activos.
  const searchJefes = useCallback(
    (q) =>
      CostosService.buscarJefes(q, {
        pais: filtros.pais,
        empresas: filtros.empresas,
        areas: filtros.areas,
        subareas: filtros.subareas,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtros.pais, empresasKey, areasKey, subareasKey],
  )

  return (
    <div className="cx-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold cx-text-primary">
          <Filter className="size-4 cx-text-secondary" />
          Filtros
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={disabled}
          className="h-7 px-2 text-xs gap-1.5"
        >
          <RotateCcw className="size-3.5" />
          Limpiar filtros
        </Button>
      </div>

      {/* Fila 1 — dimensiones organizacionales */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectDropdown
          label="Empresa"
          options={dim.empresas}
          value={filtros.empresas}
          onChange={(v) => setFiltros({ empresas: v })}
          searchable
          disabled={disabled}
        />
        <MultiSelectDropdown
          label="Subárea"
          options={dim.subareas}
          value={filtros.subareas}
          onChange={(v) => setFiltros({ subareas: v })}
          searchable
          disabled={disabled}
        />
        <MultiSelectDropdown
          label="Área"
          options={dim.areas}
          value={filtros.areas}
          onChange={(v) => setFiltros({ areas: v })}
          searchable
          disabled={disabled}
        />
        <MultiSelectDropdown
          label="C. costo"
          options={dim.centros_costo}
          value={filtros.centros_costo}
          onChange={(v) => setFiltros({ centros_costo: v })}
          searchable
          disabled={disabled}
        />
        <MultiSelectDropdown
          label="Cargo"
          options={dim.cargos}
          value={filtros.cargos}
          onChange={(v) => setFiltros({ cargos: v })}
          searchable
          disabled={disabled}
        />
      </div>

      {/* Fila 2 — búsquedas (jefatura + persona) ocupando todo el ancho */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 [&>div]:w-full [&_input]:w-full">
        <AutocompleteInput
          placeholder="Buscar jefatura…"
          value={filtros.jefatura_rut ? { rut: filtros.jefatura_rut, label: filtros.jefatura_label } : null}
          onChange={(item) =>
            setFiltros({
              jefatura_rut: item?.rut || null,
              jefatura_label: item?.label || null,
            })
          }
          search={searchJefes}
          getKey={(it) => it.rut}
          getLabel={(it) => it.full_name}
          getRut={(it) => it.rut}
          renderItem={(it) => (
            <div>
              <div className="font-medium">{it.full_name}</div>
              <div className="text-[10px] cx-text-muted">
                {it.name_role} · {it.empresa || '—'} ({it.subordinados_directos} directos)
              </div>
            </div>
          )}
          disabled={disabled}
        />
        <AutocompleteInput
          placeholder="Buscar persona…"
          value={filtros.persona_rut ? { rut: filtros.persona_rut, label: filtros.persona_label } : null}
          onChange={(item) =>
            setFiltros({
              persona_rut: item?.rut || null,
              persona_label: item?.label || null,
            })
          }
          search={(q) => CostosService.buscarPersonas(q, { pais: filtros.pais })}
          getKey={(it) => it.rut}
          getLabel={(it) => it.full_name}
          getRut={(it) => it.rut}
          renderItem={(it) => (
            <div>
              <div className="font-medium">{it.full_name}</div>
              <div className="text-[10px] cx-text-muted">
                {it.cargo || '—'} · {it.empresa || '—'}
              </div>
            </div>
          )}
          disabled={disabled}
        />
      </div>

      {/* Fila 3 — período */}
      <div className="flex flex-wrap items-center gap-2 pt-1 cx-border border-t">
        <PeriodPicker
          fecha_inicio={filtros.fecha_inicio}
          fecha_fin={filtros.fecha_fin}
          onChange={(r) => setFiltros(r)}
        />
      </div>
    </div>
  )
}
