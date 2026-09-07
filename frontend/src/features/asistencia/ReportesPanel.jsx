import React, { useState } from 'react'
import HheeAlertas from './HheeAlertas'
import Reportes from './Reportes'

/**
 * Pestaña "Reportes" con sus sub-pestañas.
 *
 * Cada reporte trae sus propios filtros (el bono pide quincenas y un archivo;
 * HHEE pide semana y recinto), así que ninguno usa la barra común de rango y
 * obra de la vista. El switcher vive acá y no en Asistencia.jsx para que la
 * página no tenga que conocer los submódulos: agregar un reporte nuevo es
 * tocar solo este archivo.
 */
const SUB = [
  { id: 'bono', label: 'Bono de Asistencia', Componente: Reportes },
  { id: 'hhee', label: 'Horas Extras', Componente: HheeAlertas },
]

const ReportesPanel = () => {
  const [sub, setSub] = useState('bono')
  const { Componente } = SUB.find((s) => s.id === sub)

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-6">
        {SUB.map((s) => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              sub === s.id
                ? 'bg-app-brand text-white'
                : 'text-app-muted hover:text-app-ink hover:bg-app-surface'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Componente />
    </div>
  )
}

export default ReportesPanel
