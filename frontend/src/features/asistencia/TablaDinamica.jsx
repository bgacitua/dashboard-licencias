import React, { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

/**
 * Tabla manejada por las columnas que declara el backend.
 *
 * Las vistas de asistencia devuelven campos distintos según el endpoint de Buk,
 * y el orden lo decide `columnas.py` en el servidor. Definir las columnas acá
 * a mano significaría mantener el mismo listado en dos lados.
 */
const titulo = (col) =>
  col.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const TablaDinamica = ({
  rows,
  columns,
  loading,
  error,
  descartados,
  vacio,
  // Columnas ya construidas (con celdas propias). Reemplazan a `columns`.
  columnasPropias,
  // Selección de filas: se controla desde afuera porque quien selecciona
  // también decide qué hacer con lo seleccionado.
  seleccion,
  onSeleccion,
  idDeFila,
  filaSeleccionable,
}) => {
  const [sorting, setSorting] = useState([])
  const [filtro, setFiltro] = useState('')

  const cols = useMemo(
    () =>
      columnasPropias ??
      columns.map((c) => ({
        accessorKey: c,
        header: titulo(c),
        cell: (info) => {
          const v = info.getValue()
          return (
            <span className="text-sm text-app-ink whitespace-nowrap">
              {v === null || v === undefined || v === '' ? '—' : String(v)}
            </span>
          )
        },
      })),
    [columns, columnasPropias]
  )

  const table = useReactTable({
    data: rows,
    columns: cols,
    state: { sorting, globalFilter: filtro, ...(seleccion ? { rowSelection: seleccion } : {}) },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFiltro,
    ...(onSeleccion ? { onRowSelectionChange: onSeleccion } : {}),
    ...(idDeFila ? { getRowId: idDeFila } : {}),
    ...(filaSeleccionable ? { enableRowSelection: filaSeleccionable } : {}),
    initialState: { pagination: { pageSize: 50 } },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  if (error) {
    return (
      <div className="px-6 py-10 text-center text-app-brand text-sm">{error}</div>
    )
  }

  const filtradas = table.getFilteredRowModel().rows.length

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar en la tabla..."
          className="text-sm border border-app-line rounded px-3 py-1.5 w-64 focus:outline-none focus:ring-1 focus:ring-app-ink"
        />
        <div className="text-sm text-app-muted">
          {filtradas} de {rows.length} filas
          {descartados > 0 && (
            <span
              className="ml-2 text-app-brand"
              title="Trabajadores que hoy no pertenecen a la obra seleccionada"
            >
              ({descartados} fuera de la obra)
            </span>
          )}
        </div>
      </div>

      <div className="border border-app-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr
                  key={hg.id}
                  className="bg-app-surface border-b border-app-line text-xs uppercase text-app-muted font-semibold"
                >
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-4 py-3 cursor-pointer select-none whitespace-nowrap"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted()] ?? ''}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-app-line">
              {loading ? (
                <tr>
                  <td colSpan={cols.length || 1} className="px-6 py-10 text-center text-app-muted text-sm">
                    Cargando…
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={cols.length || 1} className="px-6 py-10 text-center text-app-muted text-sm">
                    {vacio || 'Sin resultados para el rango seleccionado.'}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-app-surface">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-app-muted">
          <span>
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1 border border-app-line rounded disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1 border border-app-line rounded disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default TablaDinamica
