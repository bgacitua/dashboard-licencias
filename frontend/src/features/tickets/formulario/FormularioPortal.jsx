import React, { useEffect, useMemo, useReducer, useRef } from 'react';

import Pregunta, { TarjetasCamino } from './Pregunta';
import { desglosar } from '../../../components/form-builder/desglose';
import { cabeceraDeTema, estilosDeTema } from './estilos';

// Tipos que ofrecen opciones. La primera de estas es la "entrada": la que elige
// el camino (Coffee / Almuerzo) y se pinta como dos tarjetas grandes.
const SELECCION = new Set(['radiogroup', 'dropdown', 'imagepicker']);

/**
 * Renderer propio de un formulario del portal. Usa el `SurveyModel` de
 * survey-core solo como motor (modelo, visibleIf, validación, datos) y pinta todo
 * el DOM nosotros, con clases Tailwind: control total para el aspecto de página
 * web, sin el cromo de survey-react-ui.
 *
 * El mismo componente lo usan el portal real y la vista previa del admin, así la
 * preview no imita al formulario: es el formulario.
 *
 * `trabaEnvio`: motivo por el que no se puede enviar (string) o '' si se puede.
 * Lo calcula PortalSolicitud; acá solo deshabilita el botón y muestra el motivo.
 * El envío real pasa por `model.tryComplete()`, que dispara los onCompleting/
 * onComplete que PortalSolicitud ya tiene enganchados (crear/editar ticket).
 */
export default function FormularioPortal({ model, tema, trabaEnvio = '', onEnviar, onCancelar }) {
    const [, refrescar] = useReducer((x) => x + 1, 0);

    // Las ramas aparecen/desaparecen al responder: hay que repintar cuando cambia
    // un valor o la visibilidad de una pregunta.
    useEffect(() => {
        const alCambiar = () => refrescar();
        model.onValueChanged.add(alCambiar);
        model.onQuestionVisibleChanged.add(alCambiar);
        model.onPageVisibleChanged.add(alCambiar);
        return () => {
            model.onValueChanged.remove(alCambiar);
            model.onQuestionVisibleChanged.remove(alCambiar);
            model.onPageVisibleChanged.remove(alCambiar);
        };
    }, [model]);

    const lectura = model.mode === 'display';
    const preguntas = model.getAllQuestions(true);
    const cab = cabeceraDeTema(tema, { titulo: model.title, descripcion: model.description });

    // La pregunta de entrada (primera de selección) decide el camino. Se busca
    // sobre todas, no solo las visibles, para que sea estable.
    const entrada = useMemo(() => {
        return model.getAllQuestions().find((x) => SELECCION.has(x.getType())) || null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [model]);

    // Paso 1: mientras la entrada no tenga valor, solo se ven las tarjetas de
    // camino, predominantes y centradas. Elegir una pasa al formulario.
    const faseSeleccion = !lectura && entrada && entrada.isEmpty();
    const elegido = entrada && !entrada.isEmpty()
        ? desglosar(entrada.visibleChoices.find((c) => c.value === entrada.value)?.text || '').titulo
        : '';

    const tarjetaRef = useRef(null);

    // Lleva la vista a la primera sección con error, para que el usuario no tenga
    // que cazarlo. Se hace tras pintar, por eso el requestAnimationFrame.
    const irAlPrimerError = () => {
        requestAnimationFrame(() => {
            const el = tarjetaRef.current?.querySelector('[data-error="1"]');
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    };

    const enviar = () => {
        // En preview el envío no crea ticket: el que abre decide qué hacer.
        if (onEnviar) { onEnviar(model); refrescar(); return; }
        // tryComplete valida y, si pasa, dispara onComplete; si no, deja los
        // errores en las preguntas. Repintamos para mostrarlos y guiamos al error.
        const ok = model.tryComplete();
        refrescar();
        if (!ok) irAlPrimerError();
    };

    const hayMarca = cab.titulo || cab.descripcion || cab.logo;

    // Paso 1: solo las tarjetas de camino, grandes y centradas. Es su propia
    // vista; el formulario aún no aparece.
    if (faseSeleccion) {
        return (
            <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 py-12"
                style={{ ...estilosDeTema(tema), background: 'var(--fp-fondo)' }}>
                <div className="w-full max-w-3xl animate-entra text-center">
                    {cab.logo && <img src={cab.logo} alt="" className="mx-auto mb-5 h-12 w-auto object-contain" />}
                    {cab.titulo && <h1 className="mb-2 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">{cab.titulo}</h1>}
                    {entrada.title && <p className="mb-10 text-base text-slate-500">{entrada.title}</p>}
                    <TarjetasCamino q={entrada} lectura={lectura} grande />
                </div>
            </div>
        );
    }

    // Paso 2: la entrada ya eligió camino, se despliega el formulario. La entrada
    // no se repite como sección: su camino se muestra en una barra con "Cambiar".
    // En lectura (ficha) la entrada se muestra como una sección más; editable va
    // en la barra de "Cambiar", así que se saca de las secciones.
    const secciones = lectura ? preguntas : preguntas.filter((q) => q.name !== entrada?.name);
    const hayErrores = secciones.some((q) => q.errors && q.errors.length > 0);

    return (
        // Un solo elemento centrado en pantalla. Dentro, cada pregunta es una
        // sección separada por una línea; las ramas aparecen como secciones
        // nuevas, animadas, sin salir de la tarjeta.
        <div className="flex min-h-[80vh] items-center justify-center px-4 py-10"
            style={{ ...estilosDeTema(tema), background: 'var(--fp-fondo)' }}>
            <div ref={tarjetaRef} className="w-full max-w-2xl animate-entra overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">

                {hayMarca && (
                    // Barra de encabezado de la tarjeta, con el color o la imagen
                    // del tema. El título va centrado, como el rótulo de arriba.
                    <header className="relative isolate px-8 py-7 text-center text-white"
                        style={cab.imagen
                            ? { backgroundImage: `url(${cab.imagen})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                            : { background: 'linear-gradient(135deg, var(--fp-marca), color-mix(in srgb, var(--fp-marca) 72%, black))' }}>
                        {cab.imagen && <div aria-hidden className="absolute inset-0 -z-10 bg-black/40" />}
                        {cab.logo && <img src={cab.logo} alt="" className="mx-auto mb-3 h-11 w-auto object-contain" />}
                        {cab.titulo && <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{cab.titulo}</h1>}
                        {cab.descripcion && <p className="mx-auto mt-2 max-w-md text-sm text-white/85">{cab.descripcion}</p>}
                    </header>
                )}

                {/* Camino elegido + opción de cambiarlo (vuelve al paso 1). */}
                {entrada && !lectura && (
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-6 py-3 text-sm sm:px-8">
                        <span className="min-w-0 truncate font-medium text-slate-700">
                            {entrada.title}: <span className="text-[var(--fp-marca)]">{elegido}</span>
                        </span>
                        <button type="button" onClick={() => { entrada.clearValue(); refrescar(); }}
                            className="shrink-0 text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline">
                            Cambiar
                        </button>
                    </div>
                )}

                {hayErrores && (
                    <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm font-medium text-red-700 sm:px-8" role="alert">
                        Revisa los campos marcados antes de enviar.
                    </div>
                )}

                {/* Secciones: una por pregunta, separadas por una línea. */}
                <div className="divide-y divide-slate-100">
                    {secciones.map((q, i) => {
                        const conError = !!(q.errors && q.errors.length > 0);
                        return (
                            <section key={q.name}
                                data-error={conError ? '1' : undefined}
                                className={`animate-entra px-6 py-6 sm:px-8 ${conError ? 'border-l-2 border-red-400 bg-red-50/30' : ''}`}
                                style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}>
                                <Pregunta q={q} lectura={lectura} />
                            </section>
                        );
                    })}
                </div>

                {!lectura && (
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-8">
                        {onCancelar ? (
                            <button type="button" onClick={onCancelar}
                                className="rounded-[var(--fp-radio)] px-4 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-700">
                                Cancelar
                            </button>
                        ) : <span />}
                        <div className="flex flex-col items-end gap-1">
                            <button type="button" onClick={enviar} disabled={!!trabaEnvio}
                                title={trabaEnvio || undefined}
                                className="rounded-[var(--fp-radio)] bg-[var(--fp-marca)] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0">
                                {model.completeText || 'Enviar'}
                            </button>
                            {trabaEnvio && <p className="text-right text-xs text-slate-500">{trabaEnvio}</p>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
