import React, { useEffect, useMemo, useState } from 'react';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.css';

import { CampoImagen } from '../../../components/form-builder/PanelPropiedades';
import { TEMA_DEFECTO, crearModelo } from '../../../components/form-builder/tema';
import { aCompletedHtml, deCompletedHtml, definicionVacia } from '../../../components/form-builder/tipos';
import TextareaBuffer from '../../../components/form-builder/TextareaBuffer';
import Lienzo from '../builder/Lienzo';
import AdminMarco from '../components/AdminMarco';
import {
    actualizarTipo, crearTipo, eliminarTipo, listarTipos, subirImagen,
} from '../services/tickets';

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'mb-1 block text-xs font-medium text-gray-600';

const nuevoTipo = () => ({
    nombre: '', descripcion: '', portada_url: '', definicion: definicionVacia(),
    tema: { ...TEMA_DEFECTO }, dias_anticipacion: 1, hora_limite: '12:00', activo: false,
});

export default function AdminTipos() {
    const [tipos, setTipos] = useState([]);
    const [actual, setActual] = useState(null);
    const [seccion, setSeccion] = useState('formulario'); // formulario | datos | preview
    const [mensaje, setMensaje] = useState('');
    // Sin autoguardado a propósito: un tipo activo se ve en el portal, y
    // guardar cada tecla publicaría el formulario a medio editar.
    const [sucio, setSucio] = useState(false);

    const recargar = () => listarTipos().then(setTipos).catch((e) => setMensaje(e.message));
    useEffect(() => { recargar(); }, []);

    const set = (cambios) => {
        setActual((a) => ({ ...a, ...cambios }));
        setSucio(true);
    };
    const definicion = actual?.definicion || definicionVacia();

    const abrir = (t) => {
        if (sucio && !window.confirm('Hay cambios sin guardar en este tipo. ¿Descartarlos?')) return;
        setActual(t ? { ...t, hora_limite: String(t.hora_limite).slice(0, 5) } : nuevoTipo());
        setSeccion('formulario');
        setMensaje('');
        setSucio(false);
    };

    const guardar = async () => {
        setMensaje('');
        try {
            const { id, ...datos } = actual;
            const guardado = id ? await actualizarTipo(id, datos) : await crearTipo(datos);
            setActual({ ...guardado, hora_limite: String(guardado.hora_limite).slice(0, 5) });
            setMensaje('Guardado.');
            setSucio(false);
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
            setSucio(false);
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
                                <h2 className="max-w-xs truncate text-base font-semibold text-gray-900">
                                    {actual.nombre || 'Tipo sin nombre'}
                                </h2>
                                {sucio && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Sin guardar</span>}
                                <button onClick={guardar} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                                    Guardar
                                </button>
                                {actual.id && <button onClick={borrar} className="text-sm text-red-600 hover:underline">Eliminar</button>}
                                {mensaje && <span className="text-sm text-gray-600">{mensaje}</span>}
                            </div>

                            <div className="mt-4 flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
                                {[['formulario', 'Formulario'], ['datos', 'Plazo y publicación'], ['preview', 'Vista previa']].map(([k, l]) => (
                                    <button key={k} onClick={() => setSeccion(k)}
                                        className={`flex-1 rounded-md px-3 py-1.5 ${seccion === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'}`}>
                                        {l}
                                    </button>
                                ))}
                            </div>

                            {seccion === 'datos' && (
                                <section className="mt-4 grid gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-2">
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

                            {seccion === 'formulario' && (
                                <div className="mt-4">
                                    <Lienzo
                                        key={actual.id ?? 'nuevo'}
                                        definicion={definicion}
                                        onChange={(d) => set({ definicion: d })}
                                        tema={actual.tema}
                                        onTema={(tema) => set({ tema })}
                                        cabecera={{ nombre: actual.nombre, descripcion: actual.descripcion }}
                                        onCabecera={set}
                                    />
                                </div>
                            )}

                            {seccion === 'preview' && preview && (
                                <div className="mt-4 overflow-hidden rounded-xl border border-gray-200"
                                    style={{ ...preview.themeVariables, background: 'var(--sjs2-color-utility-body)' }}>
                                    <Survey model={preview} />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </AdminMarco>
    );
}
