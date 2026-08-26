// Trunca días de vacaciones a un decimal SIN aproximar: 12.29 -> 12.2, 12.99 -> 12.9.
// La API de Buk devuelve dos decimales; el finiquito se escribe con uno.
// El `* 100` + `Math.round` previo evita que la representación binaria arruine el corte
// (0.3 * 10 === 2.9999999999999996, que truncado daría 0.2).
export const truncDias = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.trunc(Math.round(num * 100) / 10) / 10;
};
