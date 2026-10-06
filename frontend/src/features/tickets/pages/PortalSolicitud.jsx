import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
    const location = useLocation();
    const manejar = useSesionPortal();
    // Lo deja crearTicket al navegar al ticket recién hecho.
    const reciencreada = !!location.state?.creada;

    const [tipo, setTipo] = useState(null);
    const [ticket, setTicket] = useState(null);
    const [fecha, setFecha] = useState('');
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const [recarga, setRecarga] = useState(0);
    // Hay respuestas escritas sin guardar. Solo para avisar antes de salir.
    const [sucio, setSucio] = useState(false);

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

    const propuesta = ticket?.propuesta || null;
    // Con un cambio esperando respuesta el formulario se congela: otro
    // encima dejaría al administrador resolviendo algo ya viejo.
    const soloLectura = !!ticket && !ticket.editable;
    const plazo = !soloLectura && fecha && tipo ? plazoPara(tipo, fecha) : null;
    const vencido = !!plazo && plazo <= new Date();
    // Por qué no se puede enviar todavía, o '' si sí se puede.
    const traba = soloLectura ? '' : !fecha
        ? 'Elige la fecha del servicio para poder enviar.'
        : vencido ? 'El plazo para esa fecha ya venció. Elige otra.' : '';

    const model = useMemo(() => {
        if (!tipo) return null;
        const m = crearModelo(tipo.definicion, tipo.tema, { titulo: tipo.nombre, descripcion: tipo.descripcion });
        if (ticket) m.data = ticket.datos;
        if (soloLectura) m.mode = 'display';
        m.completeText = ticket ? 'Enviar solicitud de cambio' : 'Enviar solicitud';
        return m;
    }, [tipo, ticket, soloLectura]);

    // El handler se engancha aparte para leer la fecha vigente sin recrear el
    // modelo (recrearlo en cada tecla borraría lo escrito en el formulario).
    useEffect(() => {
        if (!model || soloLectura) return undefined;
        const alCompletar = (_, opciones) => {
            // Red de seguridad: el botón ya está deshabilitado, pero survey-core
            // también completa con Enter desde la última pregunta.
            if (traba) {
                opciones.allow = false;
                setError(traba);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };
        const alGuardar = async (sender, opciones) => {
            opciones.showSaveInProgress();
            setAviso('');
            try {
                if (ticket) {
                    await editarTicket(ticket.id, { fecha_servicio: fecha, datos: sender.data, version: ticket.version_actual });
                    setAviso('Solicitud de cambio enviada. Rige la versión anterior hasta que el administrador la apruebe.');
                    setSucio(false);
                    setRecarga((n) => n + 1);
                } else {
                    const r = await crearTicket({ tipo_id: tipo.id, fecha_servicio: fecha, datos: sender.data });
                    opciones.showSaveSuccess('Solicitud enviada.');
                    setSucio(false);
                    navigate(`/tickets/t/${r.id}`, { replace: true, state: { creada: true } });
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
    }, [model, fecha, traba, ticket, tipo, soloLectura, navigate, manejar]);

    // El botón de enviar queda apagado mientras falte la fecha o el plazo esté
    // vencido: es preferible a dejar llenar todo y rebotar al final. Si una
    // versión de survey-core no expone la acción, el guard de onCompleting
    // sigue cubriendo el caso.
    useEffect(() => {
        const accion = model?.navigationBar?.getActionById?.('sv-nav-complete');
        if (!accion) return;
        accion.enabled = !traba;
        accion.tooltip = traba || undefined;
    }, [model, traba]);

    // Marca que hay respuestas sin guardar, para avisar antes de salir.
    useEffect(() => {
        if (!model || soloLectura) return undefined;
        const alCambiar = () => setSucio(true);
        model.onValueChanged.add(alCambiar);
        return () => model.onValueChanged.remove(alCambiar);
    }, [model, soloLectura]);

    // Cerrar o recargar la pestaña con cambios escritos. El navegador muestra
    // su propio texto; el nuestro solo activa el aviso.
    useEffect(() => {
        if (!sucio) return undefined;
        const avisar = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', avisar);
        return () => window.removeEventListener('beforeunload', avisar);
    }, [sucio]);

    // Salir por el enlace de arriba es la única navegación interna desde acá,
    // así que se intercepta ahí y no hace falta un router de datos.
    const alSalir = (e) => {
        if (sucio && !window.confirm('Tienes cambios sin guardar. ¿Salir de todos modos?')) {
            e.preventDefault();
        }
    };

    return (
        // Mismo truco que FormPublico: survey-core pinta el fondo con
        // --sjs2-color-utility-body solo dentro de su caja; con las variables
        // en la página entera, el resto del viewport resuelve el mismo color.
        <PortalLayout ancho={ticket ? 'max-w-6xl' : 'max-w-3xl'}
            estilo={model ? { ...model.themeVariables, background: 'var(--sjs2-color-utility-body)' } : undefined}>
            <Link to="/tickets" onClick={alSalir}
                className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
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
                        {propuesta
                            ? 'Tienes un cambio esperando respuesta. Podrás pedir otro cuando lo resuelvan.'
                            : ticket.editable
                                ? `Puedes pedir un cambio hasta el ${fechaHora(ticket.plazo_efectivo || ticket.plazo)} · Lo revisa el administrador antes de que rija.`
                                : ticket.estado === 'pendiente'
                                    ? 'El plazo para pedir cambios ya venció. Escríbele al administrador si necesitas una excepción.'
                                    : 'Ya no se puede modificar: el administrador lo está gestionando.'}
                    </span>
                </div>
            )}

            {propuesta && (
                <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4"
                    role="status">
                    <span className="material-symbols-outlined text-amber-700">hourglass_top</span>
                    <div>
                        <p className="text-sm font-medium text-amber-900">
                            Tu solicitud de cambio está esperando aprobación.
                        </p>
                        <p className="mt-1 text-sm text-amber-800">
                            La enviaste el {fechaHora(propuesta.created_at)} · Mientras tanto sigue rigiendo
                            lo que ves abajo; si la aprueban, te avisamos por correo.
                        </p>
                    </div>
                </div>
            )}

            {reciencreada && ticket && (
                <div className="mb-4 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 px-5 py-4"
                    role="status">
                    <span className="material-symbols-outlined text-green-700">check_circle</span>
                    <div>
                        <p className="text-sm font-medium text-green-900">
                            Solicitud #{ticket.id} registrada.
                        </p>
                        <p className="mt-1 text-sm text-green-800">
                            Te avisaremos por correo cuando cambie de estado.
                        </p>
                    </div>
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
                        aria-invalid={!!traba}
                        className={`mt-2 rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 disabled:bg-slate-50 ${
                            traba
                                ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                                : 'border-slate-300 focus:border-blue-500 focus:ring-blue-200'
                        }`}
                    />
                    {plazo && (
                        <p className={`mt-2 text-xs ${vencido ? 'text-red-600' : 'text-slate-500'}`}>
                            {vencido
                                ? `Para esa fecha el plazo venció el ${fechaHora(plazo)} · Elige otra.`
                                : `Podrás modificarla hasta el ${fechaHora(plazo)}`}
                        </p>
                    )}
                    {traba && !plazo && (
                        <p className="mt-2 text-xs text-slate-500">{traba}</p>
                    )}
                </div>
            )}

            {model && (
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <Survey model={model} />
                </div>
            )}
            </div>
            </div>
        </PortalLayout>
    );
}
