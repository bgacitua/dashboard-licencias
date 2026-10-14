import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.css';

import { crearModelo } from '../../../components/form-builder/tema';
import PortalLayout, { useSesionPortal } from '../components/PortalLayout';
import CarruselNoticias from '../components/CarruselNoticias';
import Conversacion from '../components/Conversacion';
import { Estado } from './PortalInicio';
import { useDialogo } from '../../../components/Dialogos';
import {
    bloque, cabeEnLibres, cancelarTicket, crearTicket, editarTicket, fechaCorta, fechaHora,
    mayorHueco, miTicket, plazoPara, reservasPortal, tiposPortal, tramoDe, tramoTexto,
} from '../services/tickets';

/** 'HH:MM:SS' o 'HH:MM' -> 'HH:MM', que es lo que quiere <input type="time">. */
const hhmm = (t) => `${t || ''}`.slice(0, 5);

/** La línea que explica en qué quedó la solicitud, debajo de la insignia de
 *  estado. Va aparte y no encadenada en el JSX: son seis estados cruzados con
 *  el plazo, y así ninguno termina cayendo en el `else` de otro. */
const situacion = (ticket, propuesta) => {
    if (propuesta) return 'Tienes un cambio esperando respuesta. Podrás pedir otro cuando lo resuelvan.';
    if (ticket.editable) {
        return `Puedes pedir un cambio hasta el ${fechaHora(ticket.plazo_efectivo || ticket.plazo)}`
            + ' · Lo revisa el administrador antes de que rija.';
    }
    if (ticket.estado === 'cancelado') return 'Cancelaste esta solicitud.';
    if (ticket.estado === 'rechazado') return 'El administrador rechazó esta solicitud.';
    // Sigue abierta, así que lo único que se acabó es el plazo de los cambios.
    if (ticket.cancelable) return 'El plazo para pedir cambios ya venció.';
    return 'Esta solicitud ya está cerrada.';
};

/**
 * Una sola página para pedir y para ver o editar lo pedido:
 *   /tickets/nueva/:tipoId -> formulario vacío
 *   /tickets/t/:id         -> el ticket; editable mientras esté abierto y en
 *                             plazo, y cancelable mientras esté abierto
 */
export default function PortalSolicitud() {
    const { tipoId, id } = useParams();
    const { confirmar } = useDialogo();
    const manejar = useSesionPortal();
    const [tipo, setTipo] = useState(null);
    const [ticket, setTicket] = useState(null);
    // La fecha ya no se escribe: sale de la reserva de sala elegida.
    const [reservas, setReservas] = useState(null);
    const [reservaId, setReservaId] = useState('');
    // Tramo pedido dentro de la reserva, como 'HH:MM' porque es lo que entra y
    // sale de <input type="time">.
    const [tramo, setTramo] = useState({ inicio: '', fin: '' });
    // 'reserva' elige reunión y horario; 'formulario' responde. Dos pasos y no
    // una página larga: son dos decisiones distintas y mezclarlas hacía que la
    // reservación —que es lo que manda— quedara perdida arriba del formulario.
    const [paso, setPaso] = useState('reserva');
    // Datos de la solicitud recién enviada. Con esto la página deja de ser un
    // formulario y pasa a ser el acuse: mensaje del admin, resumen y salida.
    const [enviada, setEnviada] = useState(null);
    const [errorReservas, setErrorReservas] = useState('');
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const [recarga, setRecarga] = useState(0);
    // Hay respuestas escritas sin guardar. Solo para avisar antes de salir.
    const [sucio, setSucio] = useState(false);
    // Panel de cancelación abierto, y el motivo que se está escribiendo.
    const [cancelando, setCancelando] = useState(false);
    const [motivo, setMotivo] = useState('');

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
                if (!tp && !tk) setError('Ese tipo de solicitud no está disponible.');
            })
            .catch((e) => setError(manejar(e)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipoId, id, recarga]);

    // El calendario se consulta solo si hay algo que elegir: abrir un ticket
    // cerrado no tiene por qué pegarle a Outlook. Su error va aparte del
    // general, porque Graph puede fallar sin que nada más de la página esté mal.
    const hayQueElegir = id ? !!ticket?.editable : true;
    useEffect(() => {
        if (!hayQueElegir || reservas) return;
        setErrorReservas('');
        reservasPortal()
            .then(setReservas)
            .catch((e) => { setReservas([]); setErrorReservas(manejar(e)); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hayQueElegir]);

    // Al abrir un ticket, queda elegida su reserva si todavía está en el
    // calendario. Si ya pasó o la borraron, el select parte vacío: pedir un
    // cambio obliga a elegir otra, que es justo lo que se quiere.
    useEffect(() => {
        if (!ticket || !reservas) return;
        setReservaId(reservas.some((r) => r.id === ticket.reserva_id) ? ticket.reserva_id : '');
    }, [ticket, reservas]);

    // Elegir una reserva propone su bloque entero como horario del servicio:
    // es el caso más común y deja el formulario utilizable sin tocar nada. Si
    // se vuelve a la reserva que el ticket ya tenía, vuelve su tramo guardado.
    const alElegirReserva = (r) => {
        setReservaId(r.id);
        setError('');
        const suyo = ticket && ticket.reserva_id === r.id && ticket.servicio_inicio;
        if (suyo) {
            setTramo({ inicio: hhmm(ticket.servicio_inicio), fin: hhmm(ticket.servicio_fin) });
            return;
        }
        // Con algo ya pedido en esa sala, se propone el hueco libre más largo y
        // no el bloque entero: proponer un horario que el backend va a rebotar
        // obliga a corregir algo que el portal ya sabía.
        const hueco = mayorHueco(r);
        setTramo(hueco
            ? { inicio: hhmm(hueco.inicio), fin: hhmm(hueco.fin) }
            : { inicio: hhmm(r.hora_inicio), fin: hhmm(r.hora_fin) });
    };

    // Al abrir un ticket editable con su reserva todavía vigente, el tramo
    // guardado es el que se muestra, no el bloque completo.
    useEffect(() => {
        if (!ticket?.servicio_inicio || !reservaId || reservaId !== ticket.reserva_id) return;
        setTramo({ inicio: hhmm(ticket.servicio_inicio), fin: hhmm(ticket.servicio_fin) });
    }, [ticket, reservaId]);

    const propuesta = ticket?.propuesta || null;
    // Con un cambio esperando respuesta el formulario se congela: otro
    // encima dejaría al administrador resolviendo algo ya viejo.
    const soloLectura = !!ticket && !ticket.editable;
    const reserva = (reservas || []).find((r) => r.id === reservaId) || null;
    const fecha = reserva?.fecha || '';
    const plazo = !soloLectura && fecha && tipo ? plazoPara(tipo, fecha) : null;
    const vencido = !!plazo && plazo <= new Date();
    // El tramo pedido tiene que caber en la reserva. Se compara como texto
    // 'HH:MM', que ordena igual que la hora y evita armar fechas al vuelo.
    const fueraDelBloque = !!reserva && !!tramo.inicio && !!tramo.fin
        && (tramo.inicio < hhmm(reserva.hora_inicio) || tramo.fin > hhmm(reserva.hora_fin));
    const alReves = !!tramo.inicio && !!tramo.fin && tramo.fin <= tramo.inicio;
    // Lo que el usuario ya pidió en esa sala ese día lo manda el backend con la
    // reserva. Al editar, el tramo del propio ticket no cuenta como ocupado:
    // es justo el que se está moviendo.
    const libres = (reserva?.libres || []).concat(
        ticket && ticket.reserva_id === reserva?.id && ticket.servicio_inicio
            ? [{ inicio: ticket.servicio_inicio, fin: ticket.servicio_fin }]
            : [],
    );
    const pisado = !!reserva && !!tramo.inicio && !!tramo.fin && !alReves && !fueraDelBloque
        && !cabeEnLibres(libres, tramo.inicio, tramo.fin);

    // Por qué no se puede enviar todavía, o '' si sí se puede.
    const traba = soloLectura ? '' : !reservaId
        ? 'Elige la reserva de sala para la que pides el servicio.'
        : !tramo.inicio || !tramo.fin ? 'Indica desde y hasta qué hora necesitas el servicio.'
            : alReves ? 'La hora de término tiene que ser posterior a la de inicio.'
                : fueraDelBloque ? `El horario tiene que quedar dentro de tu reserva (${bloque(reserva)}).`
                    : pisado ? (reserva.libres?.length
                        ? `Ya pediste un servicio que se pisa con ese horario. Te queda libre ${reserva.libres.map(tramoTexto).join(' y ')}.`
                        : 'Ya pediste servicios para toda esa reserva. Elige otra reservación.')
                        : vencido ? 'El plazo para esa fecha ya venció. Elige otra reserva.' : '';

    // Un ticket ya enviado se abre en su formulario: la reservación está
    // tomada y volver a elegirla es la excepción, no el primer paso.
    //
    // Salvo que haya traba —tramo vacío, o su reserva ya no está en el
    // calendario—: eso apaga el botón de enviar y solo se arregla en el paso
    // de reservación, así que abrir en el formulario dejaba al usuario
    // editando campos sin que el botón se encendiera nunca.
    useEffect(() => {
        if (!ticket) return;
        // Sin nada que elegir (solo lectura) o antes de que llegue el
        // calendario, el formulario es lo único que hay que mostrar.
        if (soloLectura) { setPaso('formulario'); return; }
        if (!reservas) return;
        setPaso(traba ? 'reserva' : 'formulario');
        // `traba` decide el paso de entrada, no se vigila después: en el
        // formulario no hay nada que la cambie y suscribirse devolvería al
        // usuario a la grilla mientras escribe.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticket, reservas, soloLectura]);

    // Cancelar no pregunta por plazos ni menciona cobros: la política de
    // cancelación no es pública para el usuario final, y el backend es el que
    // marca si esta cayó dentro de la ventana que el casino cobra.
    const cancelar = async () => {
        const seguro = await confirmar({
            titulo: 'Cancelar la solicitud',
            mensaje: 'Se dará de baja y no se preparará el servicio. Para volver a pedirlo tendrás que crear una solicitud nueva.',
            textoConfirmar: 'Sí, cancelar',
            textoCancelar: 'Volver',
            destructivo: true,
        });
        if (!seguro) return;
        setError('');
        try {
            await cancelarTicket(ticket.id, motivo.trim() || null);
            setCancelando(false);
            setMotivo('');
            setAviso('Tu solicitud quedó cancelada. Le avisamos al administrador.');
            setRecarga((n) => n + 1);
        } catch (e) { setError(manejar(e)); }
    };

    const irAlFormulario = () => {
        if (traba) { setError(traba); return; }
        setPaso('formulario');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const volverAReservas = () => {
        if (sucio && !window.confirm('Tienes respuestas sin guardar. ¿Volver a elegir la reservación?')) return;
        setPaso('reserva');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

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
                    await editarTicket(ticket.id, {
                        reserva_id: reservaId, servicio_inicio: tramo.inicio, servicio_fin: tramo.fin,
                        datos: sender.data, version: ticket.version_actual,
                    });
                    setAviso('Solicitud de cambio enviada. Rige la versión anterior hasta que el administrador la apruebe.');
                    setSucio(false);
                    setRecarga((n) => n + 1);
                } else {
                    const r = await crearTicket({
                        tipo_id: tipo.id, reserva_id: reservaId,
                        servicio_inicio: tramo.inicio, servicio_fin: tramo.fin, datos: sender.data,
                    });
                    opciones.showSaveSuccess('Gracias por completar la encuesta');
                    setSucio(false);
                    // No se navega al ticket: survey-core acaba de pasar a su
                    // página final —el mensaje que escribió el admin— y navegar
                    // lo borraba de pantalla antes de que alcanzara a leerse.
                    // Desde acá se vuelve al inicio; los cambios se piden
                    // después, desde el historial.
                    setEnviada({ id: r.id, reserva, tramo });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    }, [model, reservaId, tramo, traba, ticket, tipo, soloLectura, manejar]);

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
            {/* Enviada la solicitud, la salida es el botón de abajo: dos formas
                de volver a lo mismo en una pantalla de acuse sobran. */}
            {!enviada && (
                <Link to="/tickets" onClick={alSalir}
                    className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
                    <span className="material-symbols-outlined text-lg">arrow_back</span>
                    Mis solicitudes
                </Link>
            )}

            {/* Con ticket: seguimiento en una columna fija a la izquierda. En
                pantallas chicas no cabe al lado y baja después del formulario. */}
            <div className={ticket ? 'flex flex-col gap-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start' : ''}>
            {ticket && (
                <aside className="order-last lg:sticky lg:top-20 lg:order-none lg:h-[calc(100vh-9rem)]">
                    {/* Sin onEnviar: el usuario del portal recibe el seguimiento,
                        no conversa. Lo que tenga que decir va en una solicitud
                        de cambio, que es lo que el administrador resuelve. */}
                    <Conversacion columna eventos={ticket.eventos} />
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
                        {situacion(ticket, propuesta)}
                    </span>
                    {/* Cancelar no tiene plazo: mientras la solicitud siga
                        abierta, el botón está. Que hacerlo tarde se cobre es
                        cosa del casino y no se nombra acá. */}
                    {ticket.cancelable && !cancelando && (
                        <button type="button" onClick={() => setCancelando(true)}
                            className="text-sm font-medium text-red-700 underline underline-offset-2 hover:text-red-800">
                            Cancelar solicitud
                        </button>
                    )}
                </div>
            )}

            {cancelando && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
                    <p className="text-sm font-medium text-red-900">¿Ya no necesitas este servicio?</p>
                    <label className="mt-3 block text-sm text-red-900" htmlFor="tk-motivo-cancelar">
                        Cuéntanos por qué <span className="font-normal text-red-700">(opcional)</span>
                    </label>
                    <textarea id="tk-motivo-cancelar" rows={2} maxLength={500} value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={cancelar}
                            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800">
                            Cancelar la solicitud
                        </button>
                        <button type="button" onClick={() => { setCancelando(false); setMotivo(''); }}
                            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100">
                            Volver
                        </button>
                    </div>
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

            {aviso && <p className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{aviso}</p>}
            {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

            {/* El ticket guarda una copia de la reserva: si la movieron en
                Outlook, lo pedido sigue donde quedó. Por eso en un ticket ya
                enviado se muestra lo guardado y no lo que dice el calendario. */}
            {ticket?.hora_inicio && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                    <p className="text-sm font-medium text-slate-800">Lo que pediste</p>
                    <p className="mt-1 text-sm text-slate-600">
                        {fechaCorta(ticket.fecha_servicio)} · {tramoDe(ticket)}
                        {ticket.reserva_sala ? ` · ${ticket.reserva_sala}` : ''}
                        {ticket.reserva_asunto ? ` — ${ticket.reserva_asunto}` : ''}
                    </p>
                    {bloque(ticket) && (
                        <p className="mt-1 text-xs text-slate-500">
                            Dentro de tu reserva de {bloque(ticket)}
                        </p>
                    )}
                </div>
            )}

            {/* Dos pasos, dos rótulos. Sin esto el salto de la grilla al
                formulario parece que la página se hubiera ido a otra parte. */}
            {!soloLectura && !ticket && !enviada && tipo && (
                <ol className="mb-4 flex items-center gap-3 text-sm">
                    {[['reserva', 'Reservación'], ['formulario', 'Solicitud']].map(([clave, rotulo], i) => {
                        const activo = paso === clave;
                        const hecho = clave === 'reserva' && paso === 'formulario';
                        return (
                            <li key={clave} className="flex items-center gap-3">
                                {i > 0 && <span aria-hidden className="h-px w-6 bg-slate-300" />}
                                <span className={`flex items-center gap-2 transition-colors ${
                                    activo ? 'font-medium text-slate-900' : 'text-slate-500'
                                }`}>
                                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-all duration-200 ${
                                        hecho ? 'bg-blue-600 text-white'
                                            : activo ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                                                : 'bg-slate-200 text-slate-600'
                                    }`}>
                                        {hecho
                                            ? <span className="material-symbols-outlined text-sm">check</span>
                                            : i + 1}
                                    </span>
                                    {rotulo}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            )}

            {!soloLectura && !enviada && paso === 'reserva' && tipo && (
                <section className="animate-entra mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-5" aria-live="polite">
                    <h2 className="text-lg font-semibold text-slate-900">Mis reservaciones</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Elige la reunión para la que necesitas el servicio.
                    </p>

                    {reservas === null && !errorReservas && (
                        <p className="mt-4 text-sm text-slate-500">Buscando tus reservaciones…</p>
                    )}

                    {errorReservas && (
                        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                            {errorReservas}
                        </p>
                    )}

                    {/* Sin reservaciones no hay nada que pedir: el formulario no
                        se muestra y esto es lo único que queda en pantalla. */}
                    {reservas?.length === 0 && !errorReservas && (
                        <div className="animate-entra mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                            <span className="material-symbols-outlined text-4xl text-slate-400">event_busy</span>
                            <p className="text-sm font-medium text-slate-800">
                                No tienes reservaciones previas. Haz una reservación y vuelve a intentarlo.
                            </p>
                            <p className="text-sm text-slate-500">
                                Agenda la reunión en Outlook con una sala y aparecerá acá.
                            </p>
                        </div>
                    )}

                    {!!reservas?.length && (
                        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                            {reservas.map((r, i) => {
                                const elegida = r.id === reservaId;
                                return (
                                    // Entran escalonadas: la grilla se arma sola
                                    // de arriba abajo en vez de aparecer entera.
                                    <li key={r.id} className="animate-entra"
                                        style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                                        {/* Botón y no radio: la tarjeta entera es
                                            el área de clic y el estado lo lleva
                                            aria-pressed. */}
                                        <button
                                            type="button"
                                            onClick={() => alElegirReserva(r)}
                                            aria-pressed={elegida}
                                            className={`flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-200 ${
                                                elegida
                                                    ? 'border-blue-500 bg-blue-50 shadow-sm ring-1 ring-blue-500'
                                                    : 'border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                {/* key distinta por estado: así el
                                                    ícono se monta de nuevo y la
                                                    animación de marca se ve. */}
                                                <span key={elegida ? 'ok' : 'no'}
                                                    className={`material-symbols-outlined text-base ${elegida ? 'animate-marca text-blue-600' : 'text-slate-400'}`}>
                                                    {elegida ? 'check_circle' : 'meeting_room'}
                                                </span>
                                                <span className="font-medium text-slate-900">{r.sala}</span>
                                            </span>
                                            <span className="text-sm text-slate-700">
                                                {fechaCorta(r.fecha)} · {bloque(r)}
                                            </span>
                                            {r.asunto && (
                                                <span className="truncate text-xs text-slate-500" title={r.asunto}>
                                                    {r.asunto}
                                                </span>
                                            )}
                                            {/* Lo ya pedido se dice en la tarjeta: enterarse recién
                                                al elegir la hora es enterarse tarde. */}
                                            {!!r.ocupados?.length && (
                                                <span className={`text-xs ${r.libres?.length ? 'text-amber-700' : 'text-red-600'}`}>
                                                    Ya pediste {r.ocupados.map(tramoTexto).join(' y ')}
                                                    {r.libres?.length
                                                        ? ` · Libre ${r.libres.map(tramoTexto).join(' y ')}`
                                                        : ' · Sin horario libre'}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {/* El tramo aparece recién con una reserva elegida: antes no
                        hay rango contra el cual acotarlo. */}
                    {reserva && (
                        <div className="animate-entra mt-5 border-t border-slate-200 pt-4">
                            <p className="text-sm font-medium text-slate-800">
                                Horario del servicio <span className="text-red-600">*</span>
                            </p>
                            <div className="mt-2 flex flex-wrap items-end gap-4">
                                {[
                                    ['tk-desde', 'Desde', 'inicio'],
                                    ['tk-hasta', 'Hasta', 'fin'],
                                ].map(([htmlId, rotulo, clave]) => (
                                    <div key={clave}>
                                        <label htmlFor={htmlId} className="block text-xs text-slate-500">{rotulo}</label>
                                        <input
                                            id={htmlId}
                                            type="time"
                                            // El navegador acota el reloj al bloque;
                                            // la validación de verdad es del backend.
                                            min={hhmm(reserva.hora_inicio)}
                                            max={hhmm(reserva.hora_fin)}
                                            value={tramo[clave]}
                                            onChange={(e) => {
                                                setTramo((t) => ({ ...t, [clave]: e.target.value }));
                                                setError('');
                                            }}
                                            aria-invalid={!!traba}
                                            className={`mt-1 rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                                                traba
                                                    ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                                                    : 'border-slate-300 focus:border-blue-500 focus:ring-blue-200'
                                            }`}
                                        />
                                    </div>
                                ))}
                                <p className="pb-2 text-xs text-slate-500">
                                    Dentro de tu reserva ({bloque(reserva)})
                                </p>
                            </div>
                        </div>
                    )}

                    {plazo && (
                        <p className={`mt-3 text-xs ${vencido ? 'text-red-600' : 'text-slate-500'}`}>
                            {vencido
                                ? `Para esa fecha el plazo venció el ${fechaHora(plazo)} · Elige otra reservación.`
                                : `Podrás modificarla hasta el ${fechaHora(plazo)}`}
                        </p>
                    )}
                    {traba && !vencido && (
                        <p className="mt-3 text-xs text-slate-500">{traba}</p>
                    )}

                    {/* El paso al formulario es explícito: elegir una reunión no
                        es lo mismo que estar listo para pedir. */}
                    {!!reservas?.length && (
                        <button
                            type="button"
                            onClick={irAlFormulario}
                            disabled={!!traba}
                            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-medium text-white transition-all duration-200 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                        >
                            Continuar al formulario
                            <span className="material-symbols-outlined text-lg">arrow_forward</span>
                        </button>
                    )}
                </section>
            )}

            {/* Recién con la reservación tomada aparece el formulario. Arriba
                queda el resumen, que es lo único que hay que recordar de acá. */}
            {paso === 'formulario' && !soloLectura && !enviada && reserva && (
                <div className="animate-entra-lateral mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4">
                    <span className="material-symbols-outlined text-blue-700">event_available</span>
                    <span className="text-sm text-slate-800">
                        <span className="font-medium">{reserva.sala}</span>
                        {' · '}{fechaCorta(reserva.fecha)}
                        {' · '}{tramo.inicio}–{tramo.fin}
                    </span>
                    <button
                        type="button"
                        onClick={volverAReservas}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-blue-700 transition-colors hover:bg-blue-100"
                    >
                        <span className="material-symbols-outlined text-base">edit_calendar</span>
                        Cambiar
                    </button>
                </div>
            )}

            {/* El botón de enviar está apagado y la razón no se ve desde acá:
                lo que la destraba vive en el paso de reservación. Sin esto el
                usuario editaba campos esperando que el botón se encendiera. */}
            {paso === 'formulario' && !soloLectura && !enviada && traba && (
                <div className="animate-entra mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4"
                    role="status">
                    <span className="material-symbols-outlined text-amber-700">error_outline</span>
                    <span className="text-sm text-amber-900">{traba}</span>
                    <button
                        type="button"
                        onClick={volverAReservas}
                        className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-amber-900 transition-colors hover:bg-amber-100"
                    >
                        <span className="material-symbols-outlined text-base">edit_calendar</span>
                        Elegir reservación
                    </button>
                </div>
            )}

            {/* Enviada, el formulario se desmonta: en su lugar va el carrusel
                de noticias, que reemplaza a la página final de survey-core. */}
            {model && !enviada && (soloLectura || paso === 'formulario') && (
                <div className="animate-entra-lateral overflow-hidden rounded-2xl border border-slate-200">
                    <Survey model={model} />
                </div>
            )}

            {enviada && (
                <div className="animate-entra mt-4">
                    <CarruselNoticias />
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                        <p className="text-sm font-medium text-slate-800">
                            Lo que pediste · Solicitud #{enviada.id}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                            {fechaCorta(enviada.reserva.fecha)} · {enviada.tramo.inicio}–{enviada.tramo.fin}
                            {' · '}{enviada.reserva.sala}
                            {enviada.reserva.asunto ? ` — ${enviada.reserva.asunto}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            Dentro de tu reserva de {bloque(enviada.reserva)}
                        </p>
                    </div>
                    <Link
                        to="/tickets"
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-medium text-white transition-all duration-200 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 sm:w-auto"
                    >
                        <span className="material-symbols-outlined text-lg">home</span>
                        Volver al inicio
                    </Link>
                </div>
            )}
            </div>
            </div>
        </PortalLayout>
    );
}
