import React, { useEffect, useState } from 'react'
import SidebarLayout from '../../../components/SidebarLayout'
import PasoMatch from '../components/PasoMatch'
import PasoResultado from '../components/PasoResultado'
import Historial from '../components/Historial'
import CargosEmpresa from '../components/CargosEmpresa'
import ColaMasiva from '../components/ColaMasiva'
import { getCargosEmpresa, getEstudios, getPermisos, getNiveles, postAnalisis, postResultado } from '../services/compensaciones'

const PAISES = [['CL', 'Chile'], ['PE', 'Perú'], ['BR', 'Brasil']]
const NOMBRE_PAIS = Object.fromEntries(PAISES)
const link = 'text-sm text-app-muted hover:text-app-ink'
const segmento = (activo) => `px-3 py-1.5 text-xs font-medium ${activo ? 'bg-app-brand text-white' : 'text-app-muted'}`

export default function Compensaciones() {
  const [esAdmin, setEsAdmin] = useState(false) // admin del módulo (compensaciones.acceso)
  const [estudios, setEstudios] = useState(null)
  const [pais, setPais] = useState('CL')
  const [estudioId, setEstudioId] = useState(null)
  const [vista, setVista] = useState('nuevo') // nuevo | historial | cargos
  const [paso, setPaso] = useState('match') // match | nivel | resultado
  const [reinicio, setReinicio] = useState(0)
  const [inicial, setInicial] = useState(null) // análisis del historial que restaura PasoMatch
  const [seleccion, setSeleccion] = useState(null) // { nombre, descriptor, candidatos, cargos }
  const [guardado, setGuardado] = useState(false)
  const [niveles, setNiveles] = useState([])
  const [resultado, setResultado] = useState(null)
  const [nivel, setNivel] = useState(null)
  const [error, setError] = useState('')
  const [cargos, setCargos] = useState(null) // cargos de la empresa del estudio
  const [preparados, setPreparados] = useState({}) // cargo_empresa_id -> /match (cola masiva, en memoria)
  const [enCola, setEnCola] = useState(false) // el flujo se abrió desde la cola masiva

  useEffect(() => {
    getPermisos().then((p) => setEsAdmin(p.admin)).catch(() => {})
    getEstudios()
      .then((l) => {
        setEstudios(l)
        if (l.length && !l.some((e) => e.pais === 'CL')) setPais(l[0].pais) // usuario sin Chile
      })
      .catch(() => setError('No se pudieron cargar los estudios.'))
  }, [])

  const delPais = (estudios || []).filter((e) => e.pais === pais) // vienen del más reciente al más antiguo
  const estudio = delPais.find((e) => e.id === estudioId) || delPais[0]

  // Cargos de la empresa: se recargan al entrar a la pestaña (trae la homologación vigente).
  useEffect(() => {
    if (vista === 'cargos' && estudio) getCargosEmpresa(estudio.id).then(setCargos).catch(() => setError('No se pudieron cargar los cargos de la empresa.'))
  }, [vista, estudio?.id])

  const reiniciar = () => {
    setPaso('match')
    setEnCola(false)
    setInicial(null)
    setReinicio((n) => n + 1)
    setError('')
  }

  const fallo = (err) => setError(err.response?.data?.detail || 'Ocurrió un error. Intenta de nuevo.')

  const continuar = (sel) => {
    setError('')
    getNiveles(estudio.id, sel.cargos)
      .then((lista) => {
        setSeleccion(sel)
        setNiveles(lista)
        setPaso('nivel')
      })
      .catch(fallo)
  }

  const elegirNivel = (codigo) => {
    setError('')
    postResultado({ estudio_id: estudio.id, cargos: seleccion.cargos, nivel: codigo })
      .then((r) => {
        setResultado(r)
        setNivel(niveles.find((n) => n.codigo === codigo))
        setGuardado(false)
        setPaso('resultado')
      })
      .catch(fallo)
  }

  const guardar = () => {
    setError('')
    const { nombre, ...resto } = seleccion
    postAnalisis({ estudio_id: estudio.id, cargo_nombre: nombre, ...resto, nivel: nivel.codigo })
      .then(() => {
        setGuardado(true)
        if (!resto.cargo_empresa_id || !enCola) return
        const sig = cargos.find((c) => c.id !== resto.cargo_empresa_id && !c.analisis_id && preparados[c.id])
        if (sig) revisar(sig)
        else setVista('cargos') // cola terminada
        setCargos((l) => l.map((c) => (c.id === resto.cargo_empresa_id ? { ...c, analisis_id: -1 } : c)))
      })
      .catch(fallo)
  }

  // Abre el flujo Buscar con un cargo de la empresa (Editar, o Revisar con candidatos ya preparados).
  const abrirCargo = (c, candidatos, cola) => {
    setInicial({ nombre: c.name, descriptor: c.descriptor, candidatos, cargo_empresa_id: c.id })
    setReinicio((n) => n + 1)
    setPaso('match')
    setEnCola(cola)
    setError('')
    setVista('nuevo')
  }
  const revisar = (c) => abrirCargo(c, preparados[c.id].candidatos, true)

  // Abre un análisis guardado en el resultado; "← Volver" muestra sus niveles y candidatos.
  const abrir = (a) => {
    setError('')
    Promise.all([getNiveles(estudio.id, a.cargos), postResultado({ estudio_id: estudio.id, cargos: a.cargos, nivel: a.nivel })])
      .then(([lista, r]) => {
        const sel = { nombre: a.cargo_nombre, descriptor: a.descriptor, candidatos: a.candidatos, cargos: a.cargos }
        setInicial(sel)
        setReinicio((n) => n + 1)
        setSeleccion(sel)
        setNiveles(lista)
        setResultado(r)
        setNivel({ codigo: a.nivel, nombre: a.nivel_nombre })
        setGuardado(true)
        setPaso('resultado')
        setVista('nuevo')
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
                {PAISES.filter(([c]) => (estudios || []).some((e) => e.pais === c)).map(([codigo, etiqueta]) => (
                  <button key={codigo} type="button" aria-pressed={pais === codigo}
                    onClick={() => { setPais(codigo); setEstudioId(null); setCargos(null); reiniciar() }}
                    className={segmento(pais === codigo)}>
                    {etiqueta}
                  </button>
                ))}
              </div>
              {delPais.length > 1 && (
                <select value={estudio.id} onChange={(e) => { setEstudioId(Number(e.target.value)); setCargos(null); reiniciar() }}
                  className="rounded-lg border border-app-line bg-white px-2 py-1.5 text-xs text-app-ink">
                  {delPais.map((e) => <option key={e.id} value={e.id}>{e.vista}</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="mb-4 inline-flex overflow-hidden rounded-md border border-app-line">
            {[['nuevo', 'Buscar cargo'], ['historial', 'Historial'], ['cargos', 'Cargos empresa']].map(([valor, etiqueta]) => (
              <button key={valor} type="button" aria-pressed={vista === valor} onClick={() => setVista(valor)}
                className={segmento(vista === valor)}>
                {etiqueta}
              </button>
            ))}
          </div>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          {!estudios ? (
            !error && <p className="text-sm text-app-muted">Cargando…</p>
          ) : !estudio ? (
            <p className="text-sm text-app-muted">{estudios.length ? `Sin estudio de mercado cargado para ${NOMBRE_PAIS[pais]}.` : 'No tienes países habilitados en Compensaciones.'}</p>
          ) : (
            <>
              {vista === 'historial' && <Historial key={estudio.id} estudio={estudio} onAbrir={abrir} />}
              {/* La cola queda montada al ir al flujo: sigue preparando mientras se revisa */}
              <div hidden={vista !== 'cargos'} className="space-y-4">
                {esAdmin && (
                  <ColaMasiva key={`cola-${estudio.id}`} estudio={estudio} cargos={cargos || []} preparados={preparados}
                    onListo={(id, m) => setPreparados((p) => ({ ...p, [id]: m }))} onRevisar={revisar} />
                )}
                <CargosEmpresa key={estudio.id} estudio={estudio} cargos={cargos} esAdmin={esAdmin}
                  onEditar={(c) => abrirCargo(c, undefined, false)} />
              </div>
              {/* El flujo queda montado al ir al historial, para no perder lo que se estaba probando */}
              <div hidden={vista !== 'nuevo'}>
                <div hidden={paso !== 'match'}>
                  <PasoMatch key={`${estudio.id}-${reinicio}`} estudio={estudio} inicial={inicial} onContinuar={continuar} />
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
                    <div className="flex items-center gap-4">
                      <button type="button" className={link} onClick={() => setPaso('nivel')}>← Volver</button>
                      <button type="button" className={link} onClick={reiniciar}>Nuevo análisis</button>
                      <button type="button" disabled={guardado} onClick={guardar}
                        className="ml-auto inline-flex h-9 items-center rounded-lg bg-app-brand px-4 text-[13px] font-semibold text-white hover:bg-app-brand/90 disabled:opacity-50">
                        {guardado ? 'Análisis guardado' : 'Guardar análisis'}
                      </button>
                    </div>
                    <PasoResultado resultado={resultado} pais={estudio.pais} nivel={nivel} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </SidebarLayout>
  )
}
