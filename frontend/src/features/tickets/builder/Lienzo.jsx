import React, { useEffect, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { TEMA_DEFECTO } from '../../../components/form-builder/tema';
import { definicionVacia, nuevaPregunta } from '../../../components/form-builder/tipos';
import PanelTema from './PanelTema';
import TarjetaPregunta, { SIN_CONTORNO } from './TarjetaPregunta';
import {
    actualizar, actualizarSeccion, agregarSeccion, duplicar, eliminar, eliminarSeccion, insertar, mover, ubicar,
} from './operaciones';

function Ordenable({ id, children }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    return (
        <div ref={setNodeRef} id={`tk-q-${id}`}
            style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}>
            {children({ ...attributes, ...listeners })}
        </div>
    );
}

function BotonBarra({ icono, texto, onClick, activo }) {
    return (
        <button type="button" onClick={onClick} title={texto} aria-label={texto}
            className={`rounded-full p-2.5 hover:bg-gray-100 ${activo ? 'text-[var(--tk-color)]' : 'text-gray-600'}`}>
            <span className="material-symbols-outlined text-[22px]">{icono}</span>
        </button>
    );
}

/**
 * Lienzo del builder de tickets, al estilo de Forms: el formulario se arma
 * sobre sí mismo, con el tema aplicado en vivo. Se selecciona una tarjeta y
 * se edita en el lugar; la barra flotante agrega debajo de la seleccionada.
 *
 * `cabecera` = { nombre, descripcion } del tipo: se editan en la tarjeta de
 * encabezado, que es donde el usuario los va a ver.
 */
export default function Lienzo({ definicion: def, onChange, tema, onTema, cabecera, onCabecera }) {
    const definicion = def?.pages?.length ? def : definicionVacia();
    const [sel, setSel] = useState(null);        // nombre de pregunta | 'cabecera' | 'seccion:i'
    const [verTema, setVerTema] = useState(false);
    const t = { ...TEMA_DEFECTO, ...tema };
    const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    // Lo recién agregado queda a la vista, como en Forms.
    useEffect(() => {
        if (sel && !sel.includes(':') && sel !== 'cabecera') {
            document.getElementById(`tk-q-${sel}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [sel]);

    const pregSel = sel && ubicar(definicion, sel) ? sel : null;

    const agregar = (clave) => {
        const p = nuevaPregunta(clave);
        onChange(insertar(definicion, p, pregSel));
        setSel(p.name);
    };

    const radio = `${Math.round((Number(t.esquinas) || 0) * 1.5)}px`;
    const estiloTarjeta = {
        borderRadius: radio,
        boxShadow: t.sinPaneles ? 'none' : '0 0 0 1px #e5e7eb, 0 1px 2px rgba(0,0,0,.04)',
    };
    const multiSeccion = definicion.pages.length > 1;

    const banda = t.encabezado === 'color' || (t.encabezado === 'imagen' && t.encabezadoImagen);
    const estiloBanda = t.encabezado === 'imagen' && t.encabezadoImagen
        ? { backgroundImage: `linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,.05)), url("${encodeURI(t.encabezadoImagen)}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { background: t.color };

    return (
        <div className="flex items-start gap-4" style={{ '--tk-color': t.color }}>
            <div
                className="min-w-0 flex-1 overflow-hidden rounded-xl border border-gray-200 px-4 py-8"
                style={{
                    backgroundColor: t.fondo,
                    ...(t.fondoImagen ? { backgroundImage: `url("${encodeURI(t.fondoImagen)}")`, backgroundSize: 'cover', backgroundAttachment: 'fixed' } : {}),
                }}
                onClick={() => setSel(null)}
            >
                <div className="mx-auto max-w-2xl space-y-3">
                    {/* Encabezado */}
                    <div onClick={(e) => { e.stopPropagation(); setSel('cabecera'); }}
                        className="cursor-pointer overflow-hidden bg-white"
                        style={{ ...estiloTarjeta, ...(sel === 'cabecera' ? { boxShadow: 'inset 5px 0 0 var(--tk-color), 0 4px 12px rgba(0,0,0,.08)' } : {}) }}>
                        {banda ? (
                            <div className="relative flex items-end px-6 pb-5 pt-16" style={{ ...estiloBanda, minHeight: t.encabezado === 'imagen' ? 200 : 140 }}>
                                {t.logo && <img src={t.logo} alt="" className="absolute right-5 top-4 h-12 w-auto object-contain" />}
                                <div className="w-full">
                                    <Titulo sel={sel === 'cabecera'} cabecera={cabecera} onCabecera={onCabecera} claro />
                                </div>
                            </div>
                        ) : (
                            <div className="relative border-t-[10px] px-6 pb-5 pt-5" style={{ borderTopColor: t.color }}>
                                {t.logo && <img src={t.logo} alt="" className="absolute right-5 top-4 h-10 w-auto object-contain" />}
                                <Titulo sel={sel === 'cabecera'} cabecera={cabecera} onCabecera={onCabecera} />
                            </div>
                        )}
                    </div>

                    {definicion.pages.map((pagina, pi) => (
                        <section key={pagina.name} className="space-y-3">
                            {multiSeccion && (
                                <div onClick={(e) => { e.stopPropagation(); setSel(`seccion:${pi}`); }}
                                    className="relative cursor-pointer bg-white px-6 pb-4 pt-8"
                                    style={{ ...estiloTarjeta, ...(sel === `seccion:${pi}` ? { boxShadow: 'inset 5px 0 0 var(--tk-color), 0 4px 12px rgba(0,0,0,.08)' } : {}) }}>
                                    <span className="absolute left-0 top-0 rounded-br-lg px-3 py-1 text-xs font-medium text-white"
                                        style={{ background: t.color, borderTopLeftRadius: radio }}>
                                        Sección {pi + 1} de {definicion.pages.length}
                                    </span>
                                    <input style={SIN_CONTORNO} className="w-full border-0 border-b border-transparent bg-transparent p-0 pb-1 text-lg font-medium text-gray-900 focus:border-[var(--tk-color)] focus:outline-none focus:ring-0"
                                        value={pagina.title || ''} placeholder="Sección sin título" aria-label="Título de la sección"
                                        onChange={(e) => onChange(actualizarSeccion(definicion, pi, { title: e.target.value }))} />
                                    <input style={SIN_CONTORNO} className="mt-1 w-full border-0 border-b border-transparent bg-transparent p-0 pb-1 text-sm text-gray-600 focus:border-[var(--tk-color)] focus:outline-none focus:ring-0"
                                        value={pagina.description || ''} placeholder="Descripción (opcional)" aria-label="Descripción de la sección"
                                        onChange={(e) => onChange(actualizarSeccion(definicion, pi, { description: e.target.value || undefined }))} />
                                    {sel === `seccion:${pi}` && (
                                        <div className="mt-3 flex justify-end">
                                            <button type="button" className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onChange(eliminarSeccion(definicion, pi));
                                                    setSel(null);
                                                }}>
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                                Quitar sección (sus preguntas se juntan con la anterior)
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <DndContext sensors={sensores} collisionDetection={closestCenter}
                                onDragEnd={({ active, over }) => {
                                    if (!over || active.id === over.id) return;
                                    const els = pagina.elements || [];
                                    onChange(mover(definicion, pi,
                                        els.findIndex((e) => e.name === active.id),
                                        els.findIndex((e) => e.name === over.id)));
                                }}>
                                {/* ponytail: el arrastre ordena dentro de la sección. Para
                                    pasar una pregunta a otra sección: agregar la sección
                                    debajo de ella (la parte ahí) o quitar la sección. */}
                                <SortableContext items={(pagina.elements || []).map((e) => e.name)} strategy={verticalListSortingStrategy}>
                                    {(pagina.elements || []).map((p) => (
                                        <Ordenable key={p.name} id={p.name}>
                                            {(arrastre) => (
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <TarjetaPregunta
                                                        definicion={definicion}
                                                        pregunta={p}
                                                        seleccionada={sel === p.name}
                                                        onSeleccionar={setSel}
                                                        onChange={(nueva) => { onChange(actualizar(definicion, p.name, nueva)); setSel(nueva.name); }}
                                                        onDuplicar={() => { const r = duplicar(definicion, p.name); onChange(r.def); setSel(r.nombre); }}
                                                        onEliminar={() => { onChange(eliminar(definicion, p.name)); setSel(null); }}
                                                        arrastre={arrastre}
                                                        estiloTarjeta={estiloTarjeta}
                                                    />
                                                </div>
                                            )}
                                        </Ordenable>
                                    ))}
                                </SortableContext>
                            </DndContext>
                        </section>
                    ))}

                    <button type="button"
                        onClick={(e) => { e.stopPropagation(); agregar('radiogroup'); }}
                        className="flex w-full items-center justify-center gap-2 border-2 border-dashed border-gray-300 bg-white/70 py-4 text-sm text-gray-600 hover:border-[var(--tk-color)] hover:text-[var(--tk-color)]"
                        style={{ borderRadius: radio }}>
                        <span className="material-symbols-outlined">add_circle</span>
                        Agregar pregunta
                    </button>
                </div>
            </div>

            {/* Barra flotante, como la de Forms: agrega debajo de lo seleccionado. */}
            <div className="sticky top-4 flex flex-col rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
                <BotonBarra icono="add_circle" texto="Agregar pregunta" onClick={() => agregar('radiogroup')} />
                <BotonBarra icono="title" texto="Agregar texto informativo" onClick={() => agregar('html')} />
                <BotonBarra icono="image" texto="Agregar imagen" onClick={() => agregar('image')} />
                <BotonBarra icono="view_agenda" texto="Agregar sección"
                    onClick={() => { onChange(agregarSeccion(definicion, pregSel)); setSel(null); }} />
                <span className="mx-2 my-1 h-px bg-gray-200" />
                <BotonBarra icono="palette" texto="Tema" activo={verTema} onClick={() => setVerTema(!verTema)} />
            </div>

            {verTema && <PanelTema tema={t} onChange={onTema} onCerrar={() => setVerTema(false)} />}
        </div>
    );
}

function Titulo({ sel, cabecera, onCabecera, claro = false }) {
    const colorT = claro ? 'text-white placeholder:text-white/70' : 'text-gray-900 placeholder:text-gray-400';
    const colorD = claro ? 'text-white/85 placeholder:text-white/60' : 'text-gray-600 placeholder:text-gray-400';
    if (!sel) {
        return (
            <>
                <h2 className={`text-3xl font-normal ${claro ? 'text-white' : 'text-gray-900'}`}>
                    {cabecera.nombre || <span className="opacity-60">Formulario sin título</span>}
                </h2>
                {cabecera.descripcion && <p className={`mt-2 text-sm ${claro ? 'text-white/85' : 'text-gray-600'}`}>{cabecera.descripcion}</p>}
            </>
        );
    }
    return (
        <>
            <input autoFocus style={SIN_CONTORNO} className={`w-full border-0 border-b bg-transparent p-0 pb-1 text-3xl focus:outline-none focus:ring-0 ${colorT} ${claro ? 'border-white/40' : 'border-gray-200'}`}
                placeholder="Nombre (p. ej. Almuerzos)" aria-label="Nombre del tipo"
                value={cabecera.nombre} onChange={(e) => onCabecera({ nombre: e.target.value })} />
            <input style={SIN_CONTORNO} className={`mt-3 w-full border-0 border-b border-transparent bg-transparent p-0 pb-1 text-sm focus:outline-none focus:ring-0 ${claro ? 'focus:border-white/60' : 'focus:border-[var(--tk-color)]'} ${colorD}`}
                placeholder="Descripción (se ve también en la tarjeta del portal)" aria-label="Descripción del tipo"
                value={cabecera.descripcion || ''} onChange={(e) => onCabecera({ descripcion: e.target.value })} />
        </>
    );
}
