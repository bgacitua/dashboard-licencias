import React, { useState } from 'react';

import ListaPreguntas from './ListaPreguntas';
import PanelPropiedades from './PanelPropiedades';
import { TIPOS, definicionVacia, nuevaPagina, nuevaPregunta } from './tipos';

/**
 * Edición de la definición survey-core: páginas, preguntas y propiedades.
 *
 * Hook y no componente porque cada página ubica las dos piezas donde le
 * acomoda: el builder de formularios pone el panel como columna de alto
 * completo junto a <main>, y un layout distinto no debería obligar a tocarlo.
 *
 * `reset` se llama al abrir otro formulario, para no quedar parado en una
 * página o pregunta que no existe en el nuevo.
 */
export default function useEditorDefinicion({ definicion: def, onChange, subirImagen, tiposExcluidos = [] }) {
    const [paginaIdx, setPaginaIdx] = useState(0);
    const [seleccionada, setSeleccionada] = useState(null);

    const definicion = def?.pages?.length ? def : definicionVacia();
    const pagina = definicion.pages[paginaIdx] || definicion.pages[0];
    const pregunta = pagina.elements?.find((e) => e.name === seleccionada) || null;

    const setPaginas = (paginas) => onChange({ ...definicion, pages: paginas });
    const setElementos = (elementos) =>
        setPaginas(definicion.pages.map((p) => (p === pagina ? { ...p, elements: elementos } : p)));

    const agregar = (tipo) => {
        const p = nuevaPregunta(tipo);
        setElementos([...(pagina.elements || []), p]);
        setSeleccionada(p.name);
    };

    const reset = () => {
        setPaginaIdx(0);
        setSeleccionada(null);
    };

    const lista = (
        <section className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
                {definicion.pages.map((p, i) => (
                    <button
                        key={p.name}
                        onClick={() => { setPaginaIdx(i); setSeleccionada(null); }}
                        className={`rounded-lg px-3 py-1.5 text-sm ${
                            p === pagina ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-700'
                        }`}
                    >
                        {p.title || p.name}
                    </button>
                ))}
                <button
                    onClick={() => {
                        setPaginas([...definicion.pages, nuevaPagina(definicion.pages.length)]);
                        setPaginaIdx(definicion.pages.length);
                        setSeleccionada(null);
                    }}
                    className="rounded-lg border border-dashed border-gray-400 px-3 py-1.5 text-sm text-gray-600"
                >
                    + Página
                </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(TIPOS)
                    .filter(([tipo, meta]) => !tiposExcluidos.includes(tipo) && (subirImagen || !meta.conImagenes))
                    .map(([tipo, meta]) => (
                        <button
                            key={tipo}
                            onClick={() => agregar(tipo)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                        >
                            + {meta.label}
                        </button>
                    ))}
            </div>

            <div className="mt-4 max-w-xl">
                <ListaPreguntas
                    elementos={pagina.elements || []}
                    seleccionada={seleccionada}
                    onSeleccionar={setSeleccionada}
                    onReordenar={setElementos}
                />
            </div>
        </section>
    );

    const panel = (
        <PanelPropiedades
            definicion={definicion}
            pregunta={pregunta}
            subirImagen={subirImagen}
            onChange={(nueva) => {
                setElementos(pagina.elements.map((e) => (e.name === pregunta.name ? nueva : e)));
                setSeleccionada(nueva.name);
            }}
            onEliminar={() => {
                setElementos(pagina.elements.filter((e) => e.name !== pregunta.name));
                setSeleccionada(null);
            }}
        />
    );

    return { lista, panel, reset };
}
