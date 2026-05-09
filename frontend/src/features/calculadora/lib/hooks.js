// features/calculadora/lib/hooks.js

import { useMemo, useState, useEffect } from "react"
import { calcularRemuneracion } from "./calculations"
import { parseNumericInput } from "./utils"

export function useCalculator(params) {
  return useMemo(() => {
    const montoSueldo = parseNumericInput(params.sueldo)
    const montoMovilizacion = parseNumericInput(params.movilizacion)

    const tipoObj = params.config.bonosEmpresa.find(b => b.id === params.bonoEmpresaTipo)
    const tasaArr = tipoObj?.tasa
    const bonoEmpresaTasa = Array.isArray(tasaArr)
      ? (tasaArr[params.bonoEmpresaTasaIdx] ?? tasaArr[0] ?? 0)
      : 0
    const bonoEmpresaMonto = bonoEmpresaTasa > 0
      ? 0
      : parseNumericInput(params.bonoEmpresaMonto)

    const monto = montoSueldo === 0 ? 1000000 : montoSueldo

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
      params.config
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
  ])
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
