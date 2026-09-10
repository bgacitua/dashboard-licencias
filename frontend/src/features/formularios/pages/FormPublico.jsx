import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { BaseTheme, Model } from 'survey-core';
import { DefaultLight } from 'survey-core/themes';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.css';

import { enviarRespuesta, getFormularioPublico } from '../services/formularios';

/**
 * Formulario público. El token viaja en el query param y se manda en el body
 * del submit. El enlace sirve hasta que el token vence, así que quien ya
 * respondió puede volver y corregir: en ese caso el backend devuelve la
 * respuesta anterior y el formulario se abre con ella cargada.
 */
export default function FormPublico() {
    const { slug } = useParams();
    const [params] = useSearchParams();
    const token = params.get('token') || '';

    const [formulario, setFormulario] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        getFormularioPublico(slug, token)
            .then(setFormulario)
            .catch((err) => setError(err.message));
    }, [slug, token]);

    const model = useMemo(() => {
        if (!formulario) return null;
        const m = new Model(formulario.definicion);
        m.locale = 'es';
        // `DefaultLight.cssVariables` viene vacío en survey-core v3: es un delta
        // sobre BaseTheme, que es quien trae los ~1600 tokens --sjs2-* (tamaños,
        // espaciado, colores) que consume survey-core.css. Sin el segundo
        // argumento applyTheme no define ninguno y el CSS cae a sus fallbacks
        // hardcodeados: todo chico y el verde de marca de SurveyJS suelto.
        m.applyTheme(DefaultLight, BaseTheme);
        // `fitToContainer` es true por defecto en survey-core v3: pone
        // `.sd-root-modern--full-container`, que fija height 100% y overflow auto.
        // Dentro de un contenedor sin altura el formulario deja de medir su
        // contenido y reserva una caja de scroll vacía. Acá la página scrollea,
        // no el formulario.
        m.fitToContainer = false;
        // Respuesta previa: editar es corregir lo enviado, no rellenar de nuevo.
        if (formulario.datos) m.data = formulario.datos;
        m.onComplete.add(async (sender, options) => {
            options.showSaveInProgress();
            try {
                await enviarRespuesta(slug, token, sender.data);
                options.showSaveSuccess();
            } catch (err) {
                options.showSaveError(err.message);
            }
        });
        return m;
    }, [formulario, slug, token]);

    if (error) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="max-w-sm text-center">
                    <p className="text-gray-900 font-semibold">No se puede abrir el formulario</p>
                    <p className="mt-1 text-sm text-gray-600">{error}</p>
                </div>
            </main>
        );
    }

    if (!model) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-gray-500 text-sm">Cargando…</p>
            </main>
        );
    }

    return (
        // El fondo del formulario lo pinta `.sd-root-modern` con
        // --sjs2-color-utility-body, y ese elemento mide solo su contenido: con
        // un color propio en el <main> quedaba un recuadro del color del tema y
        // el resto del viewport en gris. Las variables del tema se aplican acá
        // para que el <main> resuelva la misma variable, sea cual sea el tema.
        <main
            className="min-h-screen px-4 py-10"
            style={{ ...model.themeVariables, background: 'var(--sjs2-color-utility-body)' }}
        >
            <div className="mx-auto w-full max-w-3xl">
                <h1 className="mb-6 text-2xl font-semibold tracking-tight text-gray-900">
                    {formulario.titulo}
                </h1>
                {formulario.version > 0 && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                        Ya respondiste este formulario. Puedes corregir lo que enviaste y volver a
                        guardarlo; queda registrada la última versión.
                    </div>
                )}
                {/* El mensaje final lo pone survey-core con el completedHtml
                    que se define en el builder. */}
                <Survey model={model} />
            </div>
        </main>
    );
}
