import React, { useState } from 'react'

import IngresoManual from './IngresoManual'
import Inasistencias from './Inasistencias'
import MarcasFallidas from './MarcasFallidas'

/**
 * Corrección de marcas: las tres formas de arreglar una jornada incompleta.
 *
 * Todas terminan en lo mismo —una marca registrada en Buk— y se diferencian por
 * de dónde sale la información:
 *   Inasistencias  — lo que reporta Buk, cruzado con el reloj y el turno.
 *   Marcas Fallidas — el intento real que quedó registrado en el dispositivo.
 *   Ingreso Manual  — lo que no aparece en ningún archivo.
 */
const SUBTABS = [
  { id: 'inasistencias', label: 'Inasistencias' },
  { id: 'marcas-fallidas', label: 'Marcas Fallidas' },
  { id: 'manual', label: 'Ingreso Manual' },
]

const CorreccionMarcas = ({ desde, hasta, obraId, obras }) => {
  const [sub, setSub] = useState('inasistencias')

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              sub === t.id
                ? 'border-app-brand text-app-brand bg-app-surface'
                : 'border-app-line text-app-muted hover:text-app-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Las tres montadas: cambiar de sub-pestaña no debe perder los archivos
          cargados ni la selección a medio hacer. */}
      <div hidden={sub !== 'inasistencias'}>
        <Inasistencias desde={desde} hasta={hasta} obraId={obraId} obras={obras} />
      </div>
      <div hidden={sub !== 'marcas-fallidas'}>
        <MarcasFallidas obraId={obraId} obras={obras} />
      </div>
      <div hidden={sub !== 'manual'}>
        <IngresoManual obraId={obraId} obras={obras} />
      </div>
    </div>
  )
}

export default CorreccionMarcas
