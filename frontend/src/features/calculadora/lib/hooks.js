// features/calculadora/lib/hooks.js

import { useMemo, useState, useEffect } from "react"
import CalculadoraService from "../../../services/calculadora.service"
import { calcularRemuneracion } from "./calculations"
import { parseBRLInput, parseNumericInput } from "./utils"

export function useCalculator(params) {
  return useMemo(() => {
    // Brasil trabaja con centavos y separadores brasileños; Chile y Perú
    // siguen con el parser de enteros de siempre.
    const parseMonto =
      params.pais === "brasil" ? parseBRLInput : parseNumericInput

    const montoSueldo = parseMonto(params.sueldo)
    const montoMovilizacion = parseNumericInput(params.movilizacion)

    const tipoObj = params.config.bonosEmpresa.find(b => b.id === params.bonoEmpresaTipo)
    const tasaArr = tipoObj?.tasa
    const bonoEmpresaTasa = Array.isArray(tasaArr)
      ? (tasaArr[params.bonoEmpresaTasaIdx] ?? tasaArr[0] ?? 0)
      : 0
    const bonoEmpresaMonto = bonoEmpresaTasa > 0
      ? 0
      : parseMonto(params.bonoEmpresaMonto)

    // Brasil no tiene sueldo por defecto: con el campo vacío se muestra el
    // resultado en cero en vez de un monto inventado en pesos chilenos.
    const monto =
      montoSueldo === 0 && params.pais !== "brasil" ? 1000000 : montoSueldo

    return calcularRemuneracion(
      params.modo,
      monto,
      params.afp,
      params.sistemaSalud,
      parseFloat(params.saludUF || "0"),
      montoMovilizacion,
      bonoEmpresaMonto,
      bonoEmpresaTasa,
      params.bonos,
      params.pais,
      params.config,
      Boolean(tipoObj?.imponible),
      Boolean(params.tieneAsignacionFamiliar)
    )
  }, [
    params.modo,
    params.sueldo,
    params.afp,
    params.sistemaSalud,
    params.saludUF,
    params.movilizacion,
    params.bonoEmpresaTipo,
    params.bonoEmpresaTasaIdx,
    params.bonoEmpresaMonto,
    params.bonos,
    params.pais,
    params.config,
    params.tieneAsignacionFamiliar,
  ])
}

/**
 * Perú: pide al backend la canasta navideña anual (y la asignación familiar
 * anual, hoy informativa: el cálculo mensual ya la incluye). El reparto de
 * utilidades está EN PAUSA y vuelve en 0. Debounce de 400ms.
 *
 * Devuelve { utilidades, utilidadesError }. En cualquier otro país devuelve
 * ambos en null y no hace request.
 */
export function usePeruUtilidades({
  pais,
  sueldoBase,
  rentaImponible,
  porcentajeUtilidades,
  tieneAsignacionFamiliar,
}) {
  const [utilidades, setUtilidades] = useState(null)
  const [utilidadesError, setUtilidadesError] = useState(null)

  useEffect(() => {
    if (pais !== "peru" || !(sueldoBase > 0)) {
      setUtilidades(null)
      setUtilidadesError(null)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(() => {
      CalculadoraService.getProyeccionUtilidadesPeru(
        {
          sueldo_base_calculado: sueldoBase,
          renta_imponible_proyectada: rentaImponible,
          porcentaje_utilidades: porcentajeUtilidades,
          tiene_asignacion_familiar: tieneAsignacionFamiliar,
        },
        controller.signal
      )
        .then((data) => {
          setUtilidades(data)
          setUtilidadesError(null)
        })
        .catch((err) => {
          if (err.code === "ERR_CANCELED") return
          setUtilidades(null)
          setUtilidadesError(
            err?.response?.data?.detail || err.message || "Error de configuración"
          )
        })
    }, 400)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [pais, sueldoBase, rentaImponible, porcentajeUtilidades, tieneAsignacionFamiliar])

  return { utilidades, utilidadesError }
}

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("darkMode")
    if (saved !== null) {
      const isDark = JSON.parse(saved)
      setDarkMode(isDark)
      applyDarkMode(isDark)
    }
  }, [])

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const newValue = !prev
      localStorage.setItem("darkMode", JSON.stringify(newValue))
      applyDarkMode(newValue)
      return newValue
    })
  }

  const applyDarkMode = (isDark) => {
    const html = document.documentElement
    if (isDark) {
      html.classList.add("dark")
    } else {
      html.classList.remove("dark")
    }
  }

  return { darkMode, toggleDarkMode }
}
