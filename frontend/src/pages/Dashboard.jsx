import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";
import { useMarcas } from "../hooks/useMarcas";
import SidebarLayout from "../components/SidebarLayout";

const inputClass =
  "w-full text-xs p-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500";

const TextFilter = ({ column, placeholder }) => (
  <input
    type="text"
    placeholder={placeholder}
    className={inputClass}
    value={column.getFilterValue() ?? ""}
    onChange={(e) => column.setFilterValue(e.target.value)}
  />
);

const SelectFilter = ({ column, options }) => (
  <select
    className={inputClass}
    value={column.getFilterValue() ?? ""}
    onChange={(e) => column.setFilterValue(e.target.value || undefined)}
  >
    <option value="">Todos</option>
    {options.map(([value, label]) => (
      <option key={value} value={value}>{label}</option>
    ))}
  </select>
);

const DateFilter = ({ column }) => (
  <input
    type="date"
    className={inputClass}
    value={column.getFilterValue() ?? ""}
    onChange={(e) => column.setFilterValue(e.target.value || undefined)}
  />
);

const Dashboard = () => {
  const { marcas, loading, recargar } = useMarcas();
  const [sorting, setSorting] = useState([]);

  const relojes = useMemo(
    () => [...new Set(marcas.map((m) => m.nombre_reloj).filter(Boolean))].sort(),
    [marcas]
  );

  const columns = useMemo(
    () => [
      {
        accessorKey: "nombre_reloj",
        header: "Reloj",
        filterFn: "equalsString",
        Filter: (col) => <SelectFilter column={col} options={relojes.map((r) => [r, r])} />,
        cell: (info) => (
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <span className="material-symbols-outlined text-gray-400 text-lg">watch</span>
            {info.getValue()}
          </span>
        ),
      },
      {
        accessorKey: "nombre_completo",
        header: "Nombre",
        Filter: (col) => <TextFilter column={col} placeholder="Filtrar nombre..." />,
        cell: (info) => (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
              {(info.getValue() || "").charAt(0)}
            </div>
            <span className="text-sm font-medium text-gray-900">{info.getValue()}</span>
          </div>
        ),
      },
      {
        id: "rut",
        accessorFn: (row) => (row.rut || "").split("-")[0],
        header: "RUT",
        Filter: (col) => <TextFilter column={col} placeholder="Filtrar RUT..." />,
        cell: (info) => <span className="text-sm text-gray-500 font-mono">{info.getValue()}</span>,
      },
      {
        accessorKey: "fecha",
        header: "Fecha",
        filterFn: "equalsString",
        Filter: (col) => <DateFilter column={col} />,
        cell: (info) => (
          <span className="text-sm text-gray-900 font-medium">
            {(info.getValue() || "").split("-").reverse().join("/")}
          </span>
        ),
      },
      {
        accessorKey: "hora_marca",
        header: "Hora Marca",
        Filter: (col) => <TextFilter column={col} placeholder="Filtrar hora..." />,
        cell: (info) => <span className="text-sm text-gray-900 font-medium">{info.getValue()}</span>,
      },
      {
        accessorKey: "tipo_marca",
        header: "Tipo de Marca",
        filterFn: "equalsString",
        Filter: (col) => (
          <SelectFilter column={col} options={[["IN", "Entrada (IN)"], ["OUT", "Salida (OUT)"]]} />
        ),
        cell: (info) => {
          const tipo = info.getValue();
          return (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                tipo === "IN" ? "bg-green-50 text-green-700" :
                tipo === "OUT" ? "bg-gray-100 text-gray-700" : "bg-blue-50 text-blue-700"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  tipo === "IN" ? "bg-green-500" : tipo === "OUT" ? "bg-gray-500" : "bg-blue-500"
                }`}
              ></span>
              {tipo === "IN" ? "Entrada" : tipo === "OUT" ? "Salida" : tipo}
            </span>
          );
        },
      },
    ],
    [relojes]
  );

  const table = useReactTable({
    data: marcas,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    initialState: { pagination: { pageSize: 50 } },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const totalFiltrado = table.getFilteredRowModel().rows.length;

  return (
    <SidebarLayout>
      <main className="p-8">
        <header className="flex items-center gap-2 text-sm text-gray-500 mb-8">
          <span className="material-symbols-outlined text-lg">home</span>
          <span>/</span>
          <span className="text-gray-900 font-medium">Dashboard</span>
        </header>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Gestión de Licencias y Asistencia</h1>
          <p className="text-gray-500">Monitoreo en tiempo real de licencias médicas, vacaciones y control de asistencia.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-900">Registro de Asistencia</h2>
            <button
              onClick={recargar}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
              title="Actualizar tabla"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <React.Fragment key={headerGroup.id}>
                      <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                        {headerGroup.headers.map((header) => (
                          <th
                            key={header.id}
                            onClick={header.column.getToggleSortingHandler()}
                            className="px-6 py-3 cursor-pointer select-none whitespace-nowrap"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted()] ?? ""}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-white border-b border-gray-100">
                        {headerGroup.headers.map((header) => (
                          <td key={header.id} className="px-6 py-2">
                            {header.column.columnDef.Filter?.(header.column)}
                          </td>
                        ))}
                      </tr>
                    </React.Fragment>
                  ))}
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr>
                      <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                        Cargando datos...
                      </td>
                    </tr>
                  ) : table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500">
                        No se encontraron registros.
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-6 py-4">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {totalFiltrado} resultados · Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </SidebarLayout>
  );
};

export default Dashboard;
