// Sufijo de cuotas para un descuento en la carta y el finiquito: " (3 cuotas)".
// Se usa el N° de cuotas que ingresa el usuario, no el `detalle` que manda Buk
// ("Cuota 1/3"): ese es el estado del préstamo hoy, y el documento debe decir
// en cuántas cuotas se está saldando la deuda.
export const sufijoCuotas = (cuotas) => {
  const n = parseInt(cuotas, 10);
  if (!Number.isFinite(n) || n < 1) return "";
  return n === 1 ? " (1 cuota)" : ` (${n} cuotas)`;
};
