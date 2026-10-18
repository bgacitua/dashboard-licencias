import React, { useEffect, useState } from 'react'
import SidebarLayout from '../../../components/SidebarLayout'
import PasoMatch from '../components/PasoMatch'
import PasoResultado from '../components/PasoResultado'
import { getEstudios, getNiveles, postResultado } from '../services/compensaciones'

const PAISES = [['CL', 'Chile'], ['PE', 'Perú'], ['BR', 'Brasil']]
const NOMBRE_PAIS = Object.fromEntries(PAISES)
const link = 'text-sm text-app-muted hover:text-app-ink'

export default function Compensaciones() {
  const [estudios, setEstudios] = useState(null)
  const [pais, setPais] = useState('CL')
  const [estudioId, setEstudioId] = useState(null)
  const [paso, setPaso] = useState('match') // match | nivel | resultado
  const [reinicio, setReinicio] = useState(0)
  const [seleccion, setSeleccion] = useState(null) // { analisisId, cargos }
  const [niveles, setNiveles] = useState([])
  const [resultado, setResultado] = useState(null)
  const [nivel, setNivel] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getEstudios().then(setEstudios).catch(() => setError('No se pudieron cargar los estudios.'))
  }, [])

  const delPais = (estudios || []).filter((e) => e.pais === pais) // vienen del más reciente al más antiguo
  const estudio = delPais.find((e) => e.id === estudioId) || delPais[0]

  const reiniciar = () => {
    setPaso('match')
    setReinicio((n) => n + 1)
    setError('')
  }

  const fallo = (err) => setError(err.response?.data?.detail || 'Ocurrió un error. Intenta de nuevo.')

  const continuar = (analisisId, cargos) => {
    setError('')
    getNiveles(estudio.id, cargos)
      .then((lista) => {
        setSeleccion({ analisisId, cargos })
        setNiveles(lista)
        setPaso('nivel')
      })
      .catch(fallo)
  }

  const elegirNivel = (codigo) => {
    setError('')
    postResultado(seleccion.analisisId, { cargos: seleccion.cargos, nivel: codigo })
      .then((r) => {
        setResultado(r)
        setNivel(niveles.find((n) => n.codigo === codigo))
        setPaso('resultado')
      })
      .catch(fallo)
  }

  return (
    <SidebarLayout>
      <div className="min-h-screen bg-app-surface font-app">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-bold text-app-ink">Compensaciones</h1>
              <p className="mt-0.5 text-sm text-app-muted">Compara un cargo con el mercado por nivel</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-app-line">
                {PAISES.map(([codigo, etiqueta]) => (
                  <button key={codigo} type="button" aria-pressed={pais === codigo}
                    onClick={() => { setPais(codigo); setEstudioId(null); reiniciar() }}
                    className={`px-3 py-1.5 text-xs font-medium ${pais === codigo ? 'bg-app-brand text-white' : 'text-app-muted'}`}>
                    {etiqueta}
                  </button>
                ))}
              </div>
              {delPais.length > 1 && (
                <select value={estudio.id} onChange={(e) => { setEstudioId(Number(e.target.value)); reiniciar() }}
                  className="rounded-lg border border-app-line bg-white px-2 py-1.5 text-xs text-app-ink">
                  {delPais.map((e) => <option key={e.id} value={e.id}>{e.vista}</option>)}
                </select>
              )}
            </div>
          </div>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          {!estudios ? (
            !error && <p className="text-sm text-app-muted">Cargando…</p>
          ) : !estudio ? (
            <p className="text-sm text-app-muted">Sin estudio de mercado cargado para {NOMBRE_PAIS[pais]}.</p>
          ) : (
            <>
              <div hidden={paso !== 'match'}>
                <PasoMatch key={`${estudio.id}-${reinicio}`} estudio={estudio} onContinuar={continuar} />
              </div>

              {paso === 'nivel' && (
                <div className="space-y-3">
                  <button type="button" className={link} onClick={() => setPaso('match')}>← Volver</button>
                  {niveles.length === 0 ? (
                    <p className="text-sm text-app-muted">Los cargos elegidos no comparten un nivel con datos</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {niveles.map((n) => (
                        <button key={n.codigo} type="button" onClick={() => elegirNivel(n.codigo)}
                          className="rounded-lg border border-app-line bg-white px-3 py-2 text-sm text-app-ink hover:border-app-ink">
                          {n.codigo} — {n.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {paso === 'resultado' && (
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <button type="button" className={link} onClick={() => setPaso('nivel')}>← Volver</button>
                    <button type="button" className={link} onClick={reiniciar}>Nuevo análisis</button>
                  </div>
                  <PasoResultado resultado={resultado} pais={estudio.pais} nivel={nivel} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </SidebarLayout>
  )
}
