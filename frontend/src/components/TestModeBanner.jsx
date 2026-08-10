import React from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Aviso fijo mientras EMAIL_TEST_REDIRECT esté configurado en el backend.
 *
 * No se puede cerrar a propósito: el riesgo que cubre es justamente que alguien
 * olvide que el modo está activo y crea que los correos llegaron a las jefaturas.
 */
const TestModeBanner = () => {
  const { emailTestRedirect } = useAuth();

  if (!emailTestRedirect) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-2
                 gap-y-1 bg-amber-400 px-4 py-2 text-center text-sm text-amber-950"
    >
      <span className="font-semibold">MODO PRUEBA DE CORREO</span>
      <span>
        Alertas, horas extras, salidas y retorno se desvían a{' '}
        <strong className="font-semibold">{emailTestRedirect}</strong>. Los correos de
        acceso (código 2FA e invitación) sí llegan a su destinatario real.
      </span>
    </div>
  );
};

export default TestModeBanner;
