import React from 'react'

/**
 * Resultado de un registro de marcas en Buk.
 *
 * Tres desenlaces con peso visual distinto, porque la acción escribe en Buk y no
 * se puede deshacer: todo bien (verde), algunas fallaron (ámbar) y prueba sin
 * enviar nada (azul). Antes era un párrafo gris igual para los tres, así que un
 * registro parcial se leía como uno exitoso.
 *
 * Los detalles de cada fila fallida van dentro del mismo bloque: si el aviso dice
 * que algo falló, el motivo tiene que estar ahí y no suelto más abajo.
 */
const ESTILOS = {
  exito: {
    caja: 'bg-emerald-50 border-emerald-200',
    icono: 'text-emerald-600',
    titulo: 'text-emerald-900',
    simbolo: 'check_circle',
  },
  parcial: {
    caja: 'bg-amber-50 border-amber-200',
    icono: 'text-amber-600',
    titulo: 'text-amber-900',
    simbolo: 'warning',
  },
  prueba: {
    caja: 'bg-blue-50 border-blue-200',
    icono: 'text-blue-600',
    titulo: 'text-blue-900',
    simbolo: 'science',
  },
}

const ResultadoMarcas = ({ resultado, className = '' }) => {
  if (!resultado) return null

  const fallidas = resultado.fallidas ?? 0
  const enviadas = resultado.enviadas ?? 0
  const errores = (resultado.resultados ?? []).filter((r) => !r.ok)

  const tono = resultado.dry_run ? 'prueba' : fallidas > 0 ? 'parcial' : 'exito'
  const e = ESTILOS[tono]

  // Concuerda sustantivo y participio: "1 marca registrada" / "2 marcas registradas".
  const cuenta = (n) => (n === 1 ? `${n} marca registrada` : `${n} marcas registradas`)

  const titulo = resultado.dry_run
    ? 'Modo de prueba: no se envió nada a Buk'
    : fallidas > 0
      ? `${cuenta(enviadas)}, ${fallidas} con error`
      : `${cuenta(enviadas)} en Buk`

  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-3 ${e.caja} ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`material-symbols-outlined text-[20px] leading-6 ${e.icono}`}>
          {e.simbolo}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${e.titulo}`}>{titulo}</p>

          {resultado.dry_run && (
            <p className="text-sm text-app-muted mt-0.5">
              El payload de las {resultado.resultados?.length ?? 0} marcas quedó en el log del
              servidor. Para registrar de verdad hay que apagar ASISTENCIA_DRY_RUN.
            </p>
          )}

          {errores.length > 0 && (
            <ul className="mt-2 space-y-1">
              {errores.map((r, i) => (
                <li key={i} className="text-sm text-red-700">
                  <span className="font-medium">{r.rut} {r.fecha}</span>: {r.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default ResultadoMarcas
