import { useEffect, useState } from 'react'
import SidebarLayout from '../components/SidebarLayout'
import CalculadoraService from '../services/calculadora.service'
import { Header } from '../features/calculadora/components/Header'
import { ModoCalculo } from '../features/calculadora/components/ModoCalculo'
import { DatosPrincipales } from '../features/calculadora/components/DatosPrincipales'
import { Bonos } from '../features/calculadora/components/Bonos'
import { Resultados } from '../features/calculadora/components/Resultados'
import { useCalculator, useDarkMode } from '../features/calculadora/lib/hooks'
import {
  AFP_DATA,
  AFP_DATA_PERU,
  TASAS_CHILE,
  TASAS_PERU,
  TAX_BRACKETS_CHILE,
  BONOS_ANUALES_UF_DEFAULT,
  BONOS_EMPRESA_DEFAULT,
  BONOS_EMPRESA_PERU_DEFAULT,
} from '../features/calculadora/lib/config'

const FALLBACK_CHILE = {
  afpData: AFP_DATA,
  ufValue: TASAS_CHILE.UF_VALUE,
  dolarValue: TASAS_CHILE.DOLAR_VALUE,
  taxBrackets: TAX_BRACKETS_CHILE,
  bonosAnualesUF: BONOS_ANUALES_UF_DEFAULT,
  bonosEmpresa: BONOS_EMPRESA_DEFAULT,
  tasas: TASAS_CHILE,
}

const FALLBACK_PERU = {
  afpData: AFP_DATA_PERU,
  ufValue: TASAS_PERU.UF_VALUE,
  dolarValue: TASAS_PERU.DOLAR_VALUE,
  taxBrackets: [],
  bonosAnualesUF: BONOS_ANUALES_UF_DEFAULT,
  bonosEmpresa: BONOS_EMPRESA_PERU_DEFAULT,
  tasas: TASAS_PERU,
}

function getFallbackConfig(pais) {
  if (pais === 'peru') return FALLBACK_PERU
  return FALLBACK_CHILE
}

// Defaults por país para selectores que dependen del país
const DEFAULTS_POR_PAIS = {
  chile: { afp: 'Uno',     sistemaSalud: 'fonasa',  sueldo: '1.000.000', movilizacion: '40.000', bonoEmpresaTipo: 'empresa', bonoEmpresaMonto: '600.000' },
  peru:  { afp: 'Integra', sistemaSalud: 'essalud', sueldo: '3.500',     movilizacion: '0',      bonoEmpresaTipo: 'empresa', bonoEmpresaMonto: '0' },
}

function normalizeConfig(raw, pais) {
  const fallback = getFallbackConfig(pais)
  if (!raw) return fallback
  return {
    afpData: raw.afpData || fallback.afpData,
    ufValue: Number(raw.ufValue) || fallback.ufValue,
    dolarValue: Number(raw.dolarValue) || fallback.dolarValue,
    taxBrackets: raw.taxBrackets || [],
    bonosAnualesUF: raw.bonosAnualesUF || fallback.bonosAnualesUF,
    bonosEmpresa: ((raw.bonosEmpresa && raw.bonosEmpresa.length > 0) ? raw.bonosEmpresa : fallback.bonosEmpresa).map((b) => ({
      ...b,
      tasa:
        b.tasa !== undefined && b.tasa !== null
          ? Array.isArray(b.tasa)
            ? b.tasa
            : [b.tasa]
          : undefined,
    })),
    tasas: raw.tasas || fallback.tasas,
  }
}

export default function Calculadora() {
  const { darkMode, toggleDarkMode } = useDarkMode()

  const [pais, setPais] = useState('chile')
  const [config, setConfig] = useState(FALLBACK_CHILE)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [configError, setConfigError] = useState(null)

  const [modo, setModo] = useState('liquido_a_base')
  const [sueldo, setSueldo] = useState('1.000.000')
  const [afp, setAfp] = useState('Uno')
  const [sistemaSalud, setSistemaSalud] = useState('fonasa')
  const [saludUF, setSaludUF] = useState('')
  const [movilizacion, setMovilizacion] = useState('40.000')
  const [bonoEmpresaTipo, setBonoEmpresaTipo] = useState('empresa')
  const [bonoEmpresaTasaIdx, setBonoEmpresaTasaIdx] = useState(0)
  const [bonoEmpresaMonto, setBonoEmpresaMonto] = useState('600.000')
  const [bonos, setBonos] = useState([])
  const [moneda, setMoneda] = useState('CLP')

  const handlePaisChange = (nuevoPais) => {
    if (nuevoPais === pais) return
    const d = DEFAULTS_POR_PAIS[nuevoPais] || DEFAULTS_POR_PAIS.chile
    setPais(nuevoPais)
    setAfp(d.afp)
    setSistemaSalud(d.sistemaSalud)
    setSaludUF('')
    setSueldo(d.sueldo)
    setMovilizacion(d.movilizacion)
    setBonoEmpresaTipo(d.bonoEmpresaTipo)
    setBonoEmpresaTasaIdx(0)
    setBonoEmpresaMonto(d.bonoEmpresaMonto)
    setMoneda(nuevoPais === 'peru' ? 'PEN' : 'CLP')
  }

  // Re-fetch de config cuando cambia el país
  useEffect(() => {
    let cancelled = false
    setLoadingConfig(true)
    setConfigError(null)
    CalculadoraService.getCountryConfig(pais)
      .then((data) => {
        if (cancelled) return
        setConfig(normalizeConfig(data, pais))
        if (data?._meta?.warnings?.length) {
          console.warn(`[calculadora] ${pais}:`, data._meta.warnings)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[calculadora] no se pudo cargar config:', err)
        setConfigError(err?.response?.data?.detail || err.message || 'Error de carga')
        setConfig(getFallbackConfig(pais))
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false)
      })
    return () => {
      cancelled = true
    }
  }, [pais])

  const resultados = useCalculator({
    modo,
    sueldo,
    afp,
    sistemaSalud,
    saludUF,
    movilizacion,
    bonoEmpresaTipo,
    bonoEmpresaTasaIdx,
    bonoEmpresaMonto,
    bonos,
    pais,
    config,
  })

  const addBono = (bono) => {
    setBonos([...bonos, { ...bono, id: Date.now().toString() }])
  }

  const removeBono = (id) => {
    setBonos(bonos.filter((b) => b.id !== id))
  }

  return (
    <SidebarLayout>
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Header
        pais={pais}
        onPaisChange={handlePaisChange}
        darkMode={darkMode}
        onDarkModeToggle={toggleDarkMode}
      />

      {configError && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-300 text-amber-900 dark:text-amber-200 rounded-md px-4 py-2 text-sm">
            No se pudo cargar la configuración del backend ({configError}). Usando valores de fallback locales.
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <ModoCalculo modo={modo} onModoChange={setModo} />

            <DatosPrincipales
              pais={pais}
              modo={modo}
              sueldo={sueldo}
              onSueldoChange={setSueldo}
              afp={afp}
              onAfpChange={setAfp}
              sistemaSalud={sistemaSalud}
              onSistemaSaludChange={setSistemaSalud}
              saludUF={saludUF}
              onSaludUFChange={setSaludUF}
              movilizacion={movilizacion}
              onMovilizacionChange={setMovilizacion}
              bonoEmpresaTipo={bonoEmpresaTipo}
              onBonoEmpresaTipoChange={(tipo) => {
                setBonoEmpresaTipo(tipo)
                setBonoEmpresaTasaIdx(0)
                const tipoObj = config.bonosEmpresa.find((b) => b.id === tipo)
                if (tipoObj?.montoFijo) {
                  setBonoEmpresaMonto(tipoObj.montoFijo.toLocaleString('es-CL'))
                }
              }}
              bonoEmpresaTasaIdx={bonoEmpresaTasaIdx}
              onBonoEmpresaTasaIdxChange={setBonoEmpresaTasaIdx}
              bonoEmpresaMonto={bonoEmpresaMonto}
              onBonoEmpresaMontoChange={setBonoEmpresaMonto}
              bonoEmpresaComputado={resultados.bonoEmpresaAnual.montoImponible}
              bonosEmpresa={config.bonosEmpresa}
              afpData={config.afpData}
              ufValue={config.ufValue}
            />

            <Bonos bonos={bonos} onAddBono={addBono} onRemoveBono={removeBono} />
          </div>

          <div className="lg:col-span-2">
            {loadingConfig ? (
              <div className="bg-card border rounded-xl p-6 text-center text-muted-foreground">
                Cargando configuración…
              </div>
            ) : (
              <Resultados
                pais={pais}
                modo={modo}
                resultados={resultados}
                moneda={moneda}
                onMonedaChange={setMoneda}
                dolarValue={config.dolarValue}
                afpData={config.afpData}
                afp={afp}
                tasas={config.tasas}
              />
            )}
          </div>
        </div>
      </main>
    </div>
    </SidebarLayout>
  )
}
