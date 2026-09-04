import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.css';

import ListaPreguntas from '../components/ListaPreguntas';
import PanelPropiedades from '../components/PanelPropiedades';
import TextareaBuffer from '../components/TextareaBuffer';
import {
    TIPOS,
    aCompletedHtml,
    deCompletedHtml,
    definicionVacia,
    nuevaPagina,
    nuevaPregunta,
} from '../components/tipos';
import {
    actualizarFormulario,
    crearFormulario,
    eliminarFormulario,
    listarFormularios,
} from '../services/formularios';

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const slugificar = (texto) =>
    texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export default function FormBuilder() {
    const [formularios, setFormularios] = useState([]);
    const [actual, setActual] = useState(null);       // formulario en edición
    const [paginaIdx, setPaginaIdx] = useState(0);
    const [seleccionada, setSeleccionada] = useState(null);
    const [vista, setVista] = useState('editor');     // editor | preview
    const [mensaje, setMensaje] = useState('');

    const [params] = useSearchParams();

    const recargar = () => listarFormularios().then(setFormularios).catch((e) => setMensaje(e.message));

    // El gestor entra con ?id=, así que el formulario pedido se abre solo. Sin
    // id se conserva el comportamiento de antes: entrar con la lista y nada
    // seleccionado.
    useEffect(() => {
        listarFormularios()
            .then((lista) => {
                setFormularios(lista);
                const id = params.get('id');
                if (id) {
                    const pedido = lista.find((f) => String(f.id) === id);
                    if (pedido) abrir(pedido);
                }
            })
            .catch((e) => setMensaje(e.message));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params]);

    const definicion = actual?.definicion || definicionVacia();
    const pagina = definicion.pages?.[paginaIdx] || definicion.pages?.[0];
    const pregunta = pagina?.elements?.find((e) => e.name === seleccionada) || null;

    const setDefinicion = (nueva) => setActual({ ...actual, definicion: nueva });

    const setPaginas = (paginas) => setDefinicion({ ...definicion, pages: paginas });

    const setElementos = (elementos) =>
        setPaginas(definicion.pages.map((p, i) => (i === paginaIdx ? { ...p, elements: elementos } : p)));

    const nuevo = () => {
        setActual({ slug: '', titulo: '', definicion: definicionVacia(), n8n_webhook_url: '', activo: true });
        setPaginaIdx(0);
        setSeleccionada(null);
        setMensaje('');
    };

    const abrir = (f) => {
        setActual(f);
        setPaginaIdx(0);
        setSeleccionada(null);
        setMensaje('');
    };

    const agregar = (tipo) => {
        const p = nuevaPregunta(tipo);
        setElementos([...(pagina.elements || []), p]);
        setSeleccionada(p.name);
    };

    const cambiarPregunta = (nueva) => {
        setElementos(pagina.elements.map((e) => (e.name === pregunta.name ? nueva : e)));
        setSeleccionada(nueva.name);
    };

    const eliminarPregunta = () => {
        setElementos(pagina.elements.filter((e) => e.name !== pregunta.name));
        setSeleccionada(null);
    };

    const guardar = async () => {
        setMensaje('');
        try {
            const datos = {
                titulo: actual.titulo,
                definicion: actual.definicion,
                n8n_webhook_url: actual.n8n_webhook_url || null,
                activo: actual.activo,
            };
            const guardado = actual.id
                ? await actualizarFormulario(actual.id, datos)
                : await crearFormulario({ ...datos, slug: actual.slug || slugificar(actual.titulo) });
            setActual(guardado);
            setMensaje('Guardado.');
            recargar();
        } catch (e) {
            setMensaje(e.message);
        }
    };

    const borrar = async () => {
        if (!actual?.id) return;
        if (!window.confirm(`Se eliminará "${actual.titulo}" y todas sus respuestas. ¿Continuar?`)) return;
        await eliminarFormulario(actual.id);
        setActual(null);
        recargar();
    };

    // Modelo de preview: se reconstruye con cada cambio del JSON, así que es lo
    // mismo que verá el trabajador en la página pública.
    const preview = useMemo(
        () => (vista === 'preview' ? new Model(definicion) : null),
        [vista, definicion]
    );

    const enlace = actual?.slug ? `/formularios/validar?f=${actual.slug}` : null;

    return (
        <div className="flex h-screen bg-gray-50">
            {/* Formularios existentes */}
            <nav className="w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-4">
                <button onClick={nuevo} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                    Nuevo formulario
                </button>
                <ul className="mt-4 space-y-1">
                    {formularios.map((f) => (
                        <li key={f.id}>
                            <button
                                onClick={() => abrir(f)}
                                className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
                                    actual?.id === f.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                                }`}
                            >
                                {f.titulo}
                                {!f.activo && <span className="ml-1 text-xs text-gray-400">(inactivo)</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>

            {!actual ? (
                <main className="flex flex-1 items-center justify-center text-sm text-gray-500">
                    Selecciona un formulario o crea uno nuevo.
                </main>
            ) : (
                <>
                    <main className="flex-1 overflow-y-auto p-6">
                        <header className="flex flex-wrap items-center gap-3">
                            <input
                                className={`${input} max-w-sm text-base font-semibold`}
                                placeholder="Título del formulario"
                                value={actual.titulo}
                                onChange={(e) => setActual({ ...actual, titulo: e.target.value })}
                            />
                            <button onClick={guardar} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                                Guardar
                            </button>
                            <button
                                onClick={() => setVista(vista === 'editor' ? 'preview' : 'editor')}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                                {vista === 'editor' ? 'Vista previa' : 'Volver al editor'}
                            </button>
                            {actual.id && (
                                <button onClick={borrar} className="text-sm text-red-600 hover:underline">Eliminar</button>
                            )}
                            {mensaje && <span className="text-sm text-gray-600">{mensaje}</span>}
                        </header>

                        <section className="mt-4 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="slug">
                                    Slug (queda en la URL del QR, no se cambia después)
                                </label>
                                <input
                                    id="slug"
                                    className={input}
                                    disabled={!!actual.id}
                                    value={actual.slug}
                                    onChange={(e) => setActual({ ...actual, slug: slugificar(e.target.value) })}
                                    placeholder={slugificar(actual.titulo || '')}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="webhook">
                                    Webhook de n8n (https, host autorizado)
                                </label>
                                <input
                                    id="webhook"
                                    className={input}
                                    value={actual.n8n_webhook_url || ''}
                                    onChange={(e) => setActual({ ...actual, n8n_webhook_url: e.target.value })}
                                    placeholder="https://n8n.cramer.cl/webhook/..."
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="mensaje-final">
                                    Mensaje final (lo que ve el trabajador al enviar)
                                </label>
                                <TextareaBuffer
                                    key={actual.id ?? 'nuevo'}
                                    id="mensaje-final"
                                    rows={2}
                                    className={input}
                                    valor={deCompletedHtml(definicion.completedHtml)}
                                    normalizar={(texto) => deCompletedHtml(aCompletedHtml(texto))}
                                    onChange={(texto) =>
                                        setDefinicion({ ...definicion, completedHtml: aCompletedHtml(texto) })
                                    }
                                    placeholder="Vacío = el mensaje por defecto de la encuesta."
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={actual.activo}
                                    onChange={(e) => setActual({ ...actual, activo: e.target.checked })}
                                />
                                Activo (si no, el gate lo rechaza)
                            </label>
                            {enlace && actual.id && (
                                <p className="self-center text-xs text-gray-500">
                                    Enlace para el QR: <code className="text-gray-700">{enlace}</code>
                                </p>
                            )}
                        </section>

                        {vista === 'preview' ? (
                            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                                <Survey model={preview} />
                            </div>
                        ) : (
                            <section className="mt-6">
                                <div className="flex flex-wrap items-center gap-2">
                                    {definicion.pages.map((p, i) => (
                                        <button
                                            key={p.name}
                                            onClick={() => { setPaginaIdx(i); setSeleccionada(null); }}
                                            className={`rounded-lg px-3 py-1.5 text-sm ${
                                                i === paginaIdx ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-700'
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
                                    {Object.entries(TIPOS).map(([tipo, meta]) => (
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
                        )}
                    </main>

                    {vista === 'editor' && (
                        <PanelPropiedades
                            definicion={definicion}
                            pregunta={pregunta}
                            onChange={cambiarPregunta}
                            onEliminar={eliminarPregunta}
                        />
                    )}
                </>
            )}
        </div>
    );
}
