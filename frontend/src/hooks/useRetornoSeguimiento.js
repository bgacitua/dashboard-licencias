import { useState, useEffect } from "react";
import { getSeguimientoRetorno, enviarAlertaRetorno } from "../services/retorno";

export const useRetornoSeguimiento = (dias = 7) => {
  const [seguimiento, setSeguimiento] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [alertaResult, setAlertaResult] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, [dias]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSeguimientoRetorno(dias);
      setSeguimiento(data);
    } catch (err) {
      console.error("Error cargando seguimiento de retorno:", err);
      setError("Error al cargar seguimiento de retorno");
    } finally {
      setLoading(false);
    }
  };

  const enviarAlerta = async (recipientEmail) => {
    try {
      setEnviando(true);
      setAlertaResult(null);
      const result = await enviarAlertaRetorno(recipientEmail, dias);
      setAlertaResult(result);
      return result;
    } catch (err) {
      const msg = err?.response?.data?.detail || "Error al enviar alerta";
      setAlertaResult({ sent: false, message: msg });
      return { sent: false, message: msg };
    } finally {
      setEnviando(false);
    }
  };

  const sinRetorno = seguimiento.filter((e) => e.retorno_registrado === false);
  const conRetorno = seguimiento.filter((e) => e.retorno_registrado === true);
  const desconocido = seguimiento.filter((e) => e.retorno_registrado === null);

  return {
    seguimiento,
    sinRetorno,
    conRetorno,
    desconocido,
    loading,
    error,
    enviando,
    alertaResult,
    recargar: cargarDatos,
    enviarAlerta,
  };
};
