import React from 'react'
import SidebarLayout from '../components/SidebarLayout'
import ReportesPanel from '../features/asistencia/ReportesPanel'

// Página propia porque los reportes se usan mucho menos que la corrección de
// marcas: separarlos deja la vista diaria de Asistencia sin ruido. ReportesPanel
// trae sus propios filtros, así que no necesita nada de la página.
const AsistenciaReportes = () => (
  <SidebarLayout>
    <main className="p-8">
      <header className="flex items-center gap-2 text-sm text-app-muted mb-8">
        <span className="material-symbols-outlined text-lg">home</span>
        <span>/</span>
        <span>Asistencia</span>
        <span>/</span>
        <span className="text-app-ink font-medium">Reportes</span>
      </header>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-app-ink mb-1">Reportes de Asistencia</h1>
        <p className="text-app-muted">Bono de asistencia y horas extras.</p>
      </div>

      <div className="bg-white rounded-xl border border-app-line p-6">
        <ReportesPanel />
      </div>
    </main>
  </SidebarLayout>
)

export default AsistenciaReportes
