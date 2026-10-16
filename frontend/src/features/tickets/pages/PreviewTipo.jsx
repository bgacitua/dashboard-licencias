import React, { useMemo, useState } from 'react';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.css';
import '../../../components/form-builder/tema-tarjetas.css';

import { crearModelo } from '../../../components/form-builder/tema';
import PortalLayout from '../components/PortalLayout';
import FormularioPortal from '../formulario/FormularioPortal';

/**
 * Vista previa de un tipo como página independiente, tal como la verá el usuario
 * final (sin el cromo del admin, sin el paso de reserva). Lee el borrador en
 * edición desde localStorage: así refleja lo que hay en el builder aunque no se
 * haya guardado. Es localStorage y no sessionStorage porque este tab se abre
 * aparte y sessionStorage no se comparte entre pestañas. El envío no crea ticket.
 */
export const CLAVE_PREVIEW = 'tk-preview';

export default function PreviewTipo() {
    const [aviso, setAviso] = useState('');

    const datos = useMemo(() => {
        try { return JSON.parse(localStorage.getItem(CLAVE_PREVIEW) || 'null'); } catch { return null; }
    }, []);

    const model = useMemo(() => {
        if (!datos) return null;
        return crearModelo(datos.definicion, datos.tema, { titulo: datos.nombre, descripcion: datos.descripcion });
    }, [datos]);

    if (!datos || !model) {
        return (
            <PortalLayout preview ancho="max-w-3xl">
                <p className="rounded-xl bg-white px-5 py-10 text-center text-sm text-slate-500 shadow-sm">
                    No hay nada que previsualizar. Abre esta página desde el botón de vista previa del editor.
                </p>
            </PortalLayout>
        );
    }

    const propio = datos.tema?.render === 'propio';

    return (
        <PortalLayout preview ancho="max-w-3xl"
            estilo={{ ...model.themeVariables, background: 'var(--sjs2-color-utility-body)' }}>
            {aviso && <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{aviso}</p>}
            {propio ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <FormularioPortal model={model} tema={datos.tema}
                        onEnviar={(m) => { m.validate(true, true); setAviso('Vista previa: la solicitud no se envía.'); }} />
                </div>
            ) : (
                <div className={`overflow-hidden rounded-2xl border border-slate-200${model.modoTarjetas ? ' tema-tarjetas' : ''}`}>
                    <Survey model={model} />
                </div>
            )}
        </PortalLayout>
    );
}
