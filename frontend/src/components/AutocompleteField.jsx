import React, { useState, useEffect, useRef } from 'react';

/**
 * Campo de texto con autocompletado.
 * - fetchSuggestions(q): función async que retorna string[]
 * - onConfirmNew: si el valor no está en sugerencias y el usuario confirma, se llama con el valor
 * - Si onConfirmNew no se pasa, los valores libres se aceptan sin confirmación
 */
export default function AutocompleteField({
  name,
  value,
  onChange,
  placeholder = '',
  fetchSuggestions,
  confirmNewMessage = (v) => `"${v}" no existe en el sistema. ¿Deseas agregarlo de todas formas?`,
  className = '',
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingValue, setPendingValue] = useState(null); // valor esperando confirmación
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Cerrar al hacer click afuera
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInput = (e) => {
    const v = e.target.value;
    onChange({ target: { name, value: v } });
    setOpen(true);
    clearTimeout(debounceRef.current);
    if (!v.trim()) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchSuggestions(v);
        setSuggestions(results);
      } finally {
        setLoading(false);
      }
    }, 250);
  };

  const selectSuggestion = (s) => {
    onChange({ target: { name, value: s } });
    setOpen(false);
    setSuggestions([]);
  };

  const handleBlur = async () => {
    // Pequeño delay para que el click en una sugerencia se procese primero
    setTimeout(async () => {
      if (!value?.trim()) { setOpen(false); return; }
      const exact = suggestions.some(s => s.toLowerCase() === value.toLowerCase());
      if (!exact && suggestions.length === 0 && value.trim()) {
        // Fetch para ver si existe exactamente
        const results = await fetchSuggestions(value).catch(() => []);
        const found = results.some(s => s.toLowerCase() === value.toLowerCase());
        if (!found) {
          setPendingValue(value);
        }
      }
      setOpen(false);
    }, 150);
  };

  const confirmNew = () => { setPendingValue(null); };
  const cancelNew = () => {
    onChange({ target: { name, value: '' } });
    setPendingValue(null);
  };

  return (
    <>
      <div ref={containerRef} className="relative">
        <input
          type="text"
          name={name}
          value={value || ''}
          onChange={handleInput}
          onBlur={handleBlur}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={`w-full border border-app-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-app-ink ${className}`}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="w-4 h-4 border-2 border-app-line border-t-emerald-500 rounded-full animate-spin inline-block" />
          </span>
        )}

        {open && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full bg-white border border-app-line rounded-xl  max-h-52 overflow-y-auto">
            {suggestions.map((s) => (
              <li
                key={s}
                onMouseDown={() => selectSuggestion(s)}
                className="px-3 py-2 text-sm text-app-muted hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer"
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal confirmación valor nuevo */}
      {pendingValue && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl  w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <span className="material-symbols-outlined text-amber-500 text-2xl flex-shrink-0">help</span>
              <p className="text-sm text-app-muted">{confirmNewMessage(pendingValue)}</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={cancelNew}
                className="px-4 py-2 text-sm border border-app-line rounded-lg text-app-muted hover:bg-app-surface"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmNew}
                className="px-4 py-2 text-sm bg-app-ink text-white rounded-lg font-semibold hover:bg-app-ink/90"
              >
                Sí, agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
