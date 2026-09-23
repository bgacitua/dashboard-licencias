import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.css';

import { crearModelo } from '../../../components/form-builder/tema';
import PortalLayout, { useSesionPortal } from '../components/PortalLayout';
import Conversacion from '../components/Conversacion';
import { Estado } from './PortalInicio';
import {
    comentarTicket, crearTicket, editarTicket, fechaHora, miTicket, plazoPara, tiposPortal,
} from '../services/tickets';

const hoyIso = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/**
 * Una sola página para pedir y para ver o editar lo pedido:
 *   /tickets/nueva/:tipoId -> formulario vacío
 *   /tickets/t/:id         -> el ticket; editable si está pendiente y en plazo
 */
export default function PortalSolicitud() {
    const { tipoId, id } = useParams();
    const navigate = useNavigate();
    const manejar = useSesionPortal();

    const [tipo, setTipo] = useState(null);
    const [ticket, setTicket] = useState(null);
    const [fecha, setFecha] = useState('');
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const [recarga, setRecarga] = useState(0);

    useEffect(() => {
        setError('');
        Promise.all([tiposPortal(), id ? miTicket(id) : Promise.resolve(null)])
            .then(([tipos, tk]) => {
                const buscado = tk ? tk.tipo_id : Number(tipoId);
                const tp = tipos.find((t) => t.id === buscado);
                // Un tipo desactivado sigue mostrando sus tickets viejos: sin
                // definición no hay formulario, pero sí estado y conversación.
                setTipo(tp || { id: buscado, nombre: tk?.tipo || 'Solicitud', definicion: { pages: [] }, tema: null });
                setTicket(tk);
                setFecha(tk?.fecha_servicio || '');
                if (!tp && !tk) setError('Ese tipo de solicitud no está disponible.');
            })
            .catch((e) => setError(manejar(e)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipoId, id, recarga]);

    const soloLectura = !!ticket && !ticket.editable;

    const model = useMemo(() => {
        if (!tipo) return null;
        const m = crearModelo(tipo.definicion, tipo.tema, { titulo: tipo.nombre, descripcion: tipo.descripcion });
        if (ticket) m.data = ticket.datos;
        if (soloLectura) m.mode = 'display';
        m.completeText = ticket ? 'Guardar cambios' : 'Enviar solicitud';
        return m;
    }, [tipo, ticket, soloLectura]);

    // El handler se engancha aparte para leer la fecha vigente sin recrear el
    // modelo (recrearlo en cada tecla borraría lo escrito en el formulario).
    useEffect(() => {
        if (!model || soloLectura) return undefined;
        const alCompletar = (_, opciones) => {
            if (!fecha) {
                opciones.allow = false;
                setError('Elige la fecha del servicio antes de enviar.');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };
        const alGuardar = async (sender, opciones) => {
            opciones.showSaveInProgress();
            setAviso('');
            try {
                if (ticket) {
                    await editarTicket(ticket.id, { fecha_servicio: fecha, datos: sender.data, version: ticket.version_actual });
                    setAviso('Cambios guardados. El administrador verá la nueva versión.');
                    setRecarga((n) => n + 1);
                } else {
                    const r = await crearTicket({ tipo_id: tipo.id, fecha_servicio: fecha, datos: sender.data });
                    opciones.showSaveSuccess('Solicitud enviada.');
                    navigate(`/tickets/t/${r.id}`, { replace: true });
                }
            } catch (e) {
                // Vuelve el formulario a edición con lo escrito, para corregir
                // (típicamente la fecha) y reintentar sin perder nada.
                setError(manejar(e));
                sender.clear(false, false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };
        model.onCompleting.add(alCompletar);
        model.onComplete.add(alGuardar);
        return () => {
            model.onCompleting.remove(alCompletar);
            model.onComplete.remove(alGuardar);
        };
    }, [model, fecha, ticket, tipo, soloLectura, navigate, manejar]);

    const plazo = !soloLectura && fecha ? plazoPara(tipo, fecha) : null;
    const vencido = plazo && plazo <= new Date();

    return (
        <PortalLayout ancho={ticket ? 'max-w-6xl' : 'max-w-3xl'}>
            <Link to="/tickets" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                Mis solicitudes
            </Link>

            {/* Con ticket: seguimiento en una columna fija a la izquierda. En
                pantallas chicas no cabe al lado y baja después del formulario. */}
            <div className={ticket ? 'flex flex-col gap-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start' : ''}>
            {ticket && (
                <aside className="order-last lg:sticky lg:top-20 lg:order-none lg:h-[calc(100vh-9rem)]">
                    <Conversacion
                        columna
                        eventos={ticket.eventos}
                        onEnviar={async (texto) => {
                            await comentarTicket(ticket.id, texto).catch((e) => { throw new Error(manejar(e)); });
                            setRecarga((n) => n + 1);
                        }}
                    />
                </aside>
            )}
            <div className="min-w-0">

            {ticket && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                    <span className="font-mono text-lg font-semibold text-slate-900">#{ticket.id}</span>
                    <Estado estado={ticket.estado} />
                    <span className="text-sm text-slate-500">
                        {ticket.version_actual > 1 ? `Versión ${ticket.version_actual} · ` : ''}
                        Actualizado {fechaHora(ticket.updated_at)}
                    </span>
                    <span className="w-full text-sm text-slate-600">
                        {ticket.editable
                            ? `Puedes modificarlo hasta el ${fechaHora(ticket.plazo)}. Cada cambio queda registrado con el mismo número.`
                            : ticket.estado === 'pendiente'
                                ? 'El plazo para modificarlo ya venció.'
                                : 'Ya no se puede modificar: el administrador lo está gestionando.'}
                    </span>
                </div>
            )}

            {aviso && <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{aviso}</p>}
            {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

            {tipo && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                    <label htmlFor="tk-fecha" className="block text-sm font-medium text-slate-800">
                        Fecha del servicio <span className="text-red-600">*</span>
                    </label>
                    <input
                        id="tk-fecha"
                        type="date"
                        min={hoyIso()}
                        disabled={soloLectura}
                        value={fecha}
                        onChange={(e) => { setFecha(e.target.value); setError(''); }}
                        className="mt-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50"
                    />
                    {plazo && (
                        <p className={`mt-2 text-xs ${vencido ? 'text-red-600' : 'text-slate-500'}`}>
                            {vencido
                                ? `Para esa fecha el plazo venció el ${fechaHora(plazo)}. Elige otra.`
                                : `Podrás modificarla hasta el ${fechaHora(plazo)}.`}
                        </p>
                    )}
                </div>
            )}

            {model && (
                // Mismo truco que FormPublico: el fondo lo pinta survey-core con
                // --sjs2-color-utility-body y el contenedor resuelve la misma variable.
                <div className="overflow-hidden rounded-2xl border border-slate-200"
                    style={{ ...model.themeVariables, background: 'var(--sjs2-color-utility-body)' }}>
                    <Survey model={model} />
                </div>
            )}
            </div>
            </div>
        </PortalLayout>
    );
}
