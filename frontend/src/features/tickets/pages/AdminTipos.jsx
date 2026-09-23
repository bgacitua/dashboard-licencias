import React, { useEffect, useMemo, useState } from 'react';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.css';

import { CampoImagen } from '../../../components/form-builder/PanelPropiedades';
import { TEMA_DEFECTO, crearModelo } from '../../../components/form-builder/tema';
import { aCompletedHtml, deCompletedHtml, definicionVacia } from '../../../components/form-builder/tipos';
import TextareaBuffer from '../../../components/form-builder/TextareaBuffer';
import useEditorDefinicion from '../../../components/form-builder/useEditorDefinicion';
import AdminMarco from '../components/AdminMarco';
import {
    actualizarTipo, crearTipo, eliminarTipo, listarTipos, subirImagen,
} from '../services/tickets';

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'mb-1 block text-xs font-medium text-gray-600';

const slugificar = (texto) =>
    texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

const nuevoTipo = () => ({
    slug: '', nombre: '', descripcion: '', portada_url: '', definicion: definicionVacia(),
    tema: { ...TEMA_DEFECTO }, dias_anticipacion: 1, hora_limite: '12:00', activo: false, orden: 0,
});

// ponytail: `file` fuera del builder de tickets. survey-core guarda el archivo
// en base64 dentro de la respuesta y cada edición es una versión nueva: un par
// de fotos por versión llenaría la tabla. Si se pide adjuntar, se sube aparte.
const EXCLUIDOS = ['file'];

function Apariencia({ tema, onChange }) {
    const t = { ...TEMA_DEFECTO, ...tema };
    const set = (k, v) => onChange({ ...t, [k]: v });
    return (
        <div className="grid gap-5 sm:grid-cols-2">
            <div>
                <span className={label}>Color principal</span>
                <div className="flex items-center gap-2">
                    <input type="color" value={t.color} onChange={(e) => set('color', e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded border border-gray-300" aria-label="Color principal" />
                    <input className={input} value={t.color} onChange={(e) => set('color', e.target.value)} aria-label="Color principal (hex)" />
                </div>
            </div>
            <div>
                <span className={label}>Color de fondo</span>
                <div className="flex items-center gap-2">
                    <input type="color" value={t.fondo} onChange={(e) => set('fondo', e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded border border-gray-300" aria-label="Color de fondo" />
                    <input className={input} value={t.fondo} onChange={(e) => set('fondo', e.target.value)} aria-label="Color de fondo (hex)" />
                </div>
            </div>
            <div>
                <label className={label} htmlFor="tk-esquinas">Esquinas: {t.esquinas}px</label>
                <input id="tk-esquinas" type="range" min="0" max="20" value={t.esquinas}
                    onChange={(e) => set('esquinas', Number(e.target.value))} className="w-full" />
            </div>
            <label className="flex items-center gap-2 self-end text-sm text-gray-700">
                <input type="checkbox" checked={!!t.sinPaneles} onChange={(e) => set('sinPaneles', e.target.checked)} />
                Preguntas sin tarjeta (estilo más limpio)
            </label>

            <div className="sm:col-span-2">
                <span className={label}>Encabezado</span>
                <div className="flex flex-wrap gap-2">
                    {[['simple', 'Solo título'], ['color', 'Banda de color'], ['imagen', 'Imagen']].map(([k, l]) => (
                        <button key={k} type="button" onClick={() => set('encabezado', k)}
                            className={`rounded-lg border px-3 py-1.5 text-sm ${
                                t.encabezado === k ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700'
                            }`}>
                            {l}
                        </button>
                    ))}
                </div>
            </div>
            {t.encabezado === 'imagen' && (
                <div className="sm:col-span-2">
                    <span className={label}>Imagen del encabezado (ancha, ideal 1600×400)</span>
                    <CampoImagen valor={t.encabezadoImagen} onChange={(v) => set('encabezadoImagen', v)} subirImagen={subirImagen} />
                </div>
            )}
            <div>
                <span className={label}>Logo (opcional)</span>
                <CampoImagen valor={t.logo} onChange={(v) => set('logo', v)} subirImagen={subirImagen} />
            </div>
            <div>
                <span className={label}>Imagen de fondo (opcional)</span>
                <CampoImagen valor={t.fondoImagen} onChange={(v) => set('fondoImagen', v)} subirImagen={subirImagen} />
            </div>
        </div>
    );
}

export default function AdminTipos() {
    const [tipos, setTipos] = useState([]);
    const [actual, setActual] = useState(null);
    const [seccion, setSeccion] = useState('formulario'); // datos | formulario | apariencia | preview
    const [mensaje, setMensaje] = useState('');

    const recargar = () => listarTipos().then(setTipos).catch((e) => setMensaje(e.message));
    useEffect(() => { recargar(); }, []);

    const set = (cambios) => setActual({ ...actual, ...cambios });
    const definicion = actual?.definicion || definicionVacia();
    const editor = useEditorDefinicion({
        definicion, onChange: (d) => set({ definicion: d }), subirImagen, tiposExcluidos: EXCLUIDOS,
    });

    const abrir = (t) => {
        setActual(t ? { ...t, hora_limite: String(t.hora_limite).slice(0, 5) } : nuevoTipo());
        setSeccion(t ? 'formulario' : 'datos');
        setMensaje('');
        editor.reset();
    };

    const guardar = async () => {
        setMensaje('');
        try {
            const { id, slug, ...datos } = actual;
            const guardado = id
                ? await actualizarTipo(id, datos)
                : await crearTipo({ ...datos, slug: slug || slugificar(actual.nombre) });
            setActual({ ...guardado, hora_limite: String(guardado.hora_limite).slice(0, 5) });
            setMensaje('Guardado.');
            recargar();
        } catch (e) {
            setMensaje(e.message);
        }
    };

    const borrar = async () => {
        if (!window.confirm(`Se eliminará el tipo "${actual.nombre}". ¿Continuar?`)) return;
        try {
            await eliminarTipo(actual.id);
            setActual(null);
            recargar();
        } catch (e) {
            setMensaje(e.message);
        }
    };

    const preview = useMemo(() => {
        if (seccion !== 'preview' || !actual) return null;
        return crearModelo(definicion, actual.tema, { titulo: actual.nombre, descripcion: actual.descripcion });
    }, [seccion, actual, definicion]);

    return (
        <AdminMarco acciones={
            <button onClick={() => abrir(null)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Nuevo tipo
            </button>
        }>
            <div className="flex gap-6">
                <ul className="w-56 shrink-0 space-y-1">
                    {tipos.map((t) => (
                        <li key={t.id}>
                            <button onClick={() => abrir(t)}
                                className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
                                    actual?.id === t.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                                }`}>
                                {t.nombre}
                                {!t.activo && <span className="ml-1 text-xs text-gray-400">(inactivo)</span>}
                            </button>
                        </li>
                    ))}
                    {tipos.length === 0 && <li className="px-3 text-sm text-gray-500">Crea el primero: Desayunos, Almuerzos…</li>}
                </ul>

                {!actual ? (
                    <p className="flex-1 rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
                        Selecciona un tipo o crea uno nuevo.
                    </p>
                ) : (
                    <div className="flex min-w-0 flex-1 gap-0">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3">
                                <input className={`${input} max-w-xs text-base font-semibold`} placeholder="Nombre (p. ej. Almuerzos)"
                                    value={actual.nombre} onChange={(e) => set({ nombre: e.target.value })} aria-label="Nombre" />
                                <button onClick={guardar} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                                    Guardar
                                </button>
                                {actual.id && <button onClick={borrar} className="text-sm text-red-600 hover:underline">Eliminar</button>}
                                {mensaje && <span className="text-sm text-gray-600">{mensaje}</span>}
                            </div>

                            <div className="mt-4 flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
                                {[['datos', 'Datos y plazo'], ['formulario', 'Formulario'], ['apariencia', 'Apariencia'], ['preview', 'Vista previa']].map(([k, l]) => (
                                    <button key={k} onClick={() => setSeccion(k)}
                                        className={`flex-1 rounded-md px-3 py-1.5 ${seccion === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>
                                        {l}
                                    </button>
                                ))}
                            </div>

                            {seccion === 'datos' && (
                                <section className="mt-4 grid gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2">
                                    <div>
                                        <label className={label} htmlFor="tk-slug">Código (no se cambia después)</label>
                                        <input id="tk-slug" className={input} disabled={!!actual.id} value={actual.slug}
                                            placeholder={slugificar(actual.nombre || '')}
                                            onChange={(e) => set({ slug: slugificar(e.target.value) })} />
                                    </div>
                                    <div>
                                        <label className={label} htmlFor="tk-orden">Orden en el portal</label>
                                        <input id="tk-orden" type="number" className={input} value={actual.orden}
                                            onChange={(e) => set({ orden: Number(e.target.value) || 0 })} />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className={label} htmlFor="tk-desc">Descripción (se ve en la tarjeta y bajo el título)</label>
                                        <textarea id="tk-desc" rows={2} className={input} value={actual.descripcion || ''}
                                            onChange={(e) => set({ descripcion: e.target.value })} />
                                    </div>
                                    <div className="sm:col-span-2 rounded-lg bg-blue-50 p-4">
                                        <p className="text-sm font-medium text-blue-900">Plazo para pedir y modificar</p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-blue-900">
                                            Hasta
                                            <input type="number" min="0" max="60" className={`${input} w-20`} aria-label="Días de anticipación"
                                                value={actual.dias_anticipacion}
                                                onChange={(e) => set({ dias_anticipacion: Math.max(0, Number(e.target.value) || 0) })} />
                                            día(s) antes de la fecha del servicio, a las
                                            <input type="time" className={`${input} w-32`} aria-label="Hora límite"
                                                value={actual.hora_limite} onChange={(e) => set({ hora_limite: e.target.value })} />
                                        </div>
                                        <p className="mt-2 text-xs text-blue-800">
                                            Pasado ese momento el usuario ya no puede crear ni editar para esa fecha. Cambiar esta regla no mueve el plazo de lo que ya se pidió.
                                        </p>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <span className={label}>Imagen de la tarjeta en el portal</span>
                                        <CampoImagen valor={actual.portada_url} onChange={(v) => set({ portada_url: v })} subirImagen={subirImagen} />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className={label} htmlFor="tk-final">Mensaje al enviar</label>
                                        <TextareaBuffer
                                            key={actual.id ?? 'nuevo'}
                                            id="tk-final"
                                            rows={2}
                                            className={input}
                                            valor={deCompletedHtml(definicion.completedHtml)}
                                            normalizar={(texto) => deCompletedHtml(aCompletedHtml(texto))}
                                            onChange={(texto) => set({ definicion: { ...definicion, completedHtml: aCompletedHtml(texto) } })}
                                            placeholder="Vacío = el mensaje por defecto."
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        <input type="checkbox" checked={actual.activo} onChange={(e) => set({ activo: e.target.checked })} />
                                        Activo (visible en el portal)
                                    </label>
                                </section>
                            )}

                            {seccion === 'formulario' && editor.lista}

                            {seccion === 'apariencia' && (
                                <section className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
                                    <Apariencia tema={actual.tema} onChange={(tema) => set({ tema })} />
                                </section>
                            )}

                            {seccion === 'preview' && preview && (
                                <div className="mt-4 overflow-hidden rounded-xl border border-gray-200"
                                    style={{ ...preview.themeVariables, background: 'var(--sjs2-color-utility-body)' }}>
                                    <Survey model={preview} />
                                </div>
                            )}
                        </div>
                        {seccion === 'formulario' && <div className="ml-6 overflow-hidden rounded-xl border border-gray-200">{editor.panel}</div>}
                    </div>
                )}
            </div>
        </AdminMarco>
    );
}
