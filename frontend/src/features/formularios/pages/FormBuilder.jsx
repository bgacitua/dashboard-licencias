import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BaseTheme, Model } from 'survey-core';
import { DefaultLight } from 'survey-core/themes';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.css';

import TextareaBuffer from '../../../components/form-builder/TextareaBuffer';
import { aCompletedHtml, deCompletedHtml, definicionVacia } from '../../../components/form-builder/tipos';
import useEditorDefinicion from '../../../components/form-builder/useEditorDefinicion';
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

    const setDefinicion = (nueva) => setActual({ ...actual, definicion: nueva });

    // ponytail: el file de survey-core guarda el archivo en base64 dentro de la
    // respuesta; queda como estaba. Las imágenes del builder (image,
    // imagepicker) no se ofrecen acá porque formularios no tiene dónde subirlas.
    const editor = useEditorDefinicion({ definicion, onChange: setDefinicion });

    const nuevo = () => {
        setActual({ slug: '', titulo: '', definicion: definicionVacia(), n8n_webhook_url: '', activo: true });
        editor.reset();
        setMensaje('');
    };

    const abrir = (f) => {
        setActual(f);
        editor.reset();
        setMensaje('');
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
    const preview = useMemo(() => {
        if (vista !== 'preview') return null;
        const m = new Model(definicion);
        m.locale = 'es';
        // BaseTheme es obligatorio, ver FormPublico. Mismo tema y locale que la
        // página pública: si el preview se ve
        // distinto a lo que recibe el trabajador, no sirve de preview.
        m.applyTheme(DefaultLight, BaseTheme);
        return m;
    }, [vista, definicion]);

    return (
        <div className="flex h-screen bg-gray-50">
            {/* Formularios existentes */}
            {/* ponytail: el builder no va dentro de SidebarLayout como el resto
                del módulo — ya tiene su propia columna de navegación y usa
                h-screen, así que anidarlo daría dos sidebars y desbordaría el
                alto. En su lugar lleva su propia salida al gestor. Si algún día
                se quiere el sidebar acá, hay que pasar el layout a min-h-screen. */}
            <nav className="w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-4">
                <Link
                    to="/formularios/gestor"
                    className="mb-3 flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                >
                    <span className="material-symbols-outlined text-lg">arrow_back</span>
                    Volver al gestor
                </Link>
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
                                    Código (queda en la URL del formulario, no se cambia después)
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
                                Activo (si no, no se puede enviar ni responder)
                            </label>
                        </section>

                        {vista === 'preview' ? (
                            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                                <Survey model={preview} />
                            </div>
                        ) : (
                            editor.lista
                        )}
                    </main>

                    {vista === 'editor' && editor.panel}
                </>
            )}
        </div>
    );
}
