import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

// Reemplazo de los diálogos nativos del navegador (confirm/alert).
//
//   const { confirmar, avisar } = useDialogo();
//   if (!(await confirmar({ mensaje: '¿Eliminar?', destructivo: true }))) return;
//   avisar(err.message, { tipo: 'error' });
//
// `confirmar` devuelve una promesa igual que `confirm()`, así que el reemplazo
// en las páginas es mecánico: se le antepone `await`.

const DialogoCtx = createContext(null);

export const useDialogo = () => {
  const ctx = useContext(DialogoCtx);
  if (!ctx) throw new Error('useDialogo necesita <DialogoProvider> más arriba en el árbol');
  return ctx;
};

const ESTILO_TOAST = {
  error: 'border-red-200 bg-red-50 text-red-700',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  info: 'border-app-line bg-white text-app-ink',
};

const ICONO_TOAST = { error: 'error', ok: 'check_circle', info: 'info' };

export function DialogoProvider({ children }) {
  const [confirmacion, setConfirmacion] = useState(null); // { ...opciones, resolver }
  const [avisos, setAvisos] = useState([]);               // [{ id, mensaje, tipo, detalle }]
  const siguienteId = useRef(0);

  const cerrarAviso = useCallback((id) => {
    setAvisos(prev => prev.filter(a => a.id !== id));
  }, []);

  const avisar = useCallback((mensaje, { tipo = 'error', detalle = null, duracion = 6000 } = {}) => {
    const id = ++siguienteId.current;
    setAvisos(prev => [...prev, { id, mensaje: String(mensaje), tipo, detalle }]);
    // ponytail: los avisos con detalle quedan hasta que el usuario los cierre;
    // los simples se van solos. Sin cola ni límite, son pocos a la vez.
    if (!detalle) setTimeout(() => cerrarAviso(id), duracion);
    return id;
  }, [cerrarAviso]);

  const confirmar = useCallback((opciones) => {
    const opts = typeof opciones === 'string' ? { mensaje: opciones } : opciones;
    return new Promise(resolver => setConfirmacion({ ...opts, resolver }));
  }, []);

  const responder = (valor) => {
    confirmacion?.resolver(valor);
    setConfirmacion(null);
  };

  return (
    <DialogoCtx.Provider value={{ confirmar, avisar }}>
      {children}

      {confirmacion && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onKeyDown={e => e.key === 'Escape' && responder(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
          >
            <div className="px-6 py-4">
              <h2 className="text-base font-semibold text-app-ink">
                {confirmacion.titulo || '¿Confirmas la acción?'}
              </h2>
              <p className="mt-1 whitespace-pre-line text-[13px] text-app-muted">{confirmacion.mensaje}</p>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-app-line bg-app-surface px-6 py-3">
              <button
                type="button"
                onClick={() => responder(false)}
                className="h-9 rounded-lg border border-app-line bg-white px-4 text-[13px] font-medium text-app-muted transition-colors hover:border-app-ink hover:text-app-ink"
              >
                {confirmacion.textoCancelar || 'Cancelar'}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => responder(true)}
                className={`h-9 rounded-lg px-4 text-[13px] font-semibold text-white transition-colors ${
                  confirmacion.destructivo
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-app-brand hover:bg-app-brand/90'
                }`}
              >
                {confirmacion.textoConfirmar || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
          {avisos.map(a => (
            <div
              key={a.id}
              role="status"
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.12)] ${ESTILO_TOAST[a.tipo] || ESTILO_TOAST.info}`}
            >
              <span className="material-symbols-outlined text-[18px] leading-5">{ICONO_TOAST[a.tipo] || 'info'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{a.mensaje}</p>
                {a.detalle && (
                  <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-black/5 p-2 text-[11px] text-app-muted">
                    {a.detalle}
                  </pre>
                )}
              </div>
              <button
                type="button"
                onClick={() => cerrarAviso(a.id)}
                aria-label="Cerrar aviso"
                className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
              >
                <span className="material-symbols-outlined text-[18px] leading-5">close</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </DialogoCtx.Provider>
  );
}
