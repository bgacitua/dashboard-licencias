import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.css';
import '../../../components/form-builder/tema-tarjetas.css';

import { crearModelo } from '../../../components/form-builder/tema';
import FormularioPortal from '../formulario/FormularioPortal';
import PortalLayout, { useSesionPortal } from '../components/PortalLayout';
import CarruselNoticias from '../components/CarruselNoticias';
import Desglosado from '../components/Desglosado';
import ResumenVivo from '../components/ResumenVivo';
import Seguimiento from '../components/Seguimiento';
import { Estado } from './PortalInicio';
import { useDialogo } from '../../../components/Dialogos';
import { etiquetas, mismasRespuestas, resumenCampos, valoresDe } from '../respuestas';
import {
    bloque, cabeEnLibres, cancelarTicket, crearTicket, editarTicket, fechaCorta, fechaHora,
    mayorHueco, miTicket, plazoPara, reservasPortal, tiposPortal, tramoDe, tramoTexto,
} from '../services/tickets';

const SIN_CAMBIOS = 'Todavía no cambiaste nada. Modifica el horario o alguna respuesta para poder enviar.';

/** 'HH:MM:SS' o 'HH:MM' -> 'HH:MM', que es lo que quiere <input type="time">. */
const hhmm = (t) => `${t || ''}`.slice(0, 5);

/**
 * El valor de una pregunta como lista de textos legibles, para el resumen vivo.
 *
 * Se lee `q.value` y se traduce con `etqs` en vez de usar `q.displayValue`:
 * ese getter devuelve `locText.textOrHtml`, o sea el HTML de las tarjetas que
 * inyecta `crearModelo`, y el resumen mostraría el marcado crudo.
 */
const valoresVivos = (q, etqs) => {
    // Un booleano guarda true/false, que en pantalla no dice nada. Los rótulos
    // son de la propia pregunta y el desglose no los toca.
    if (q.getType() === 'boolean') return [q.value ? q.labelTrue : q.labelFalse];
    // Una fecha guarda el ISO crudo; en esta página se lee corta en todos lados.
    if (q.inputType === 'date') return [fechaCorta(q.value)];
    return valoresDe(q.value, etqs);
};

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
export default function PortalSolicitud({ modificando = false }) {
    const { tipoId, id } = useParams();
    const navegar = useNavigate();
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
    // Lo contestado hasta ahora, para el resumen de la derecha. Va en estado y
    // no se deriva en el render: el modelo de survey-core es mutable y React
    // no se entera de que cambió.
    const [vivo, setVivo] = useState([]);
    // Las respuestas crudas del formulario. Van aparte de `vivo`, que son filas
    // ya formateadas para dibujar: para saber si el usuario cambió algo hay que
    // comparar los valores, no su texto.
    const [datosVivos, setDatosVivos] = useState(null);
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
        reservasPortal(id)
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
        setError('');
        // Segundo click sobre la misma: se suelta. Sin esto, elegida una sala
        // no había forma de volver a "ninguna" salvo recargar, y en un paso
        // que es justamente de elegir eso se siente trabado.
        if (r.id === reservaId) {
            setReservaId('');
            setTramo({ inicio: '', fin: '' });
            return;
        }
        setReservaId(r.id);
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

    // Lo respondido en la versión que rige, pregunta por pregunta. Sale de los
    // mismos helpers que usa el panel: una sola forma de leer un formulario
    // guardado, y las preguntas que el admin sacó después igual se muestran.
    const etqs = useMemo(() => etiquetas(tipo?.definicion), [tipo]);

    // Lo contestado que survey-core está mostrando ahora mismo. `visibleOnly`
    // deja fuera lo escondido por un `visibleIf`: el resumen no puede afirmar
    // algo que el usuario no tiene a la vista.
    const leerVivo = useCallback((m) => (m
        ? m.getAllQuestions(true)
            .filter((q) => !q.isEmpty())
            .map((q) => ({ name: q.name, title: q.title || q.name, valores: valoresVivos(q, etqs) }))
        : []), [etqs]);
    const respondido = useMemo(
        () => (ticket ? resumenCampos(tipo?.definicion, ticket.datos) : []),
        [tipo, ticket],
    );

    const propuesta = ticket?.propuesta || null;
    // Con un cambio esperando respuesta el formulario se congela: otro
    // encima dejaría al administrador resolviendo algo ya viejo.
    const soloLectura = !!ticket && !ticket.editable;

    // `/tickets/t/:id` es la ficha: estado, seguimiento y lo que se pidió, sin
    // formulario. `/tickets/t/:id/modificar` es el asistente, el mismo de
    // crear. Antes eran la misma pantalla y el formulario colgaba al final de
    // la ficha, que es lo que confundía.
    const esFicha = !!ticket && !modificando;
    const esAsistente = !ticket || modificando;
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
    // reserva, y al editar ya viene sin el tramo del propio ticket: su id viaja
    // en la llamada. Acá no se vuelve a compensar, por dos razones. La regla de
    // qué ocupa un horario queda escrita en un solo lado, que es el que valida
    // al guardar. Y sumarlo de nuevo rompería el aviso de choque: el backend
    // devuelve el tramo propio ya fundido con el hueco contiguo, así que el
    // concat dejaba el mensaje diciendo "te queda libre 12:00 a 14:00 y 12:00
    // a 13:00".
    const libres = reserva?.libres || [];
    const pisado = !!reserva && !!tramo.inicio && !!tramo.fin && !alReves && !fueraDelBloque
        && !cabeEnLibres(libres, tramo.inicio, tramo.fin);

    // Por qué no se puede enviar todavía, o '' si sí se puede.
    const traba = soloLectura ? '' : !reservaId
        ? 'Elige la reserva de sala para la que pides el servicio.'
        : !tramo.inicio || !tramo.fin ? 'Indica desde y hasta qué hora necesitas el servicio.'
            : alReves ? 'La hora de término tiene que ser posterior a la de inicio.'
                : fueraDelBloque ? `El horario tiene que quedar dentro de tu reserva (${bloque(reserva)}).`
                    : pisado ? (libres.length
                        ? `Ya pediste un servicio que se pisa con ese horario. Te queda libre ${libres.map(tramoTexto).join(' y ')}.`
                        : 'Ya pediste servicios para toda esa reserva. Elige otra reservación.')
                        : vencido ? 'El plazo para esa fecha ya venció. Elige otra reserva.' : '';

    // Un cambio que no cambia nada deja el ticket 'en_revision' y al
    // administrador resolviendo una revisión que no pide nada. El backend lo
    // rechaza igual; acá se apaga el botón para no hacer el viaje.
    //
    // `datosVivos` es null hasta que el modelo existe: sin respuestas que
    // comparar no se puede afirmar que no hubo cambios, así que no traba.
    const sinCambios = !!ticket && !!datosVivos
        && reservaId === ticket.reserva_id
        && hhmm(tramo.inicio) === hhmm(ticket.servicio_inicio)
        && hhmm(tramo.fin) === hhmm(ticket.servicio_fin)
        && mismasRespuestas(datosVivos, ticket.datos);

    // Lo que impide enviar. Va aparte de `traba`, que también apaga el botón
    // del paso 1: ahí el formulario ni se ha abierto y nada pudo cambiar
    // todavía, así que trabarlo dejaba al usuario sin poder entrar a editar.
    const trabaEnvio = traba
        || (sinCambios ? SIN_CAMBIOS : '');

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

    // El resumen vivo es solo de la solicitud nueva y solo del paso 2. Abriendo
    // un ticket, la columna es del Seguimiento; en el paso 1 todavía no hay
    // nada que resumir, y enviada la solicitud el resumen ya no sirve.
    //
    // Va debajo de `model` y no arriba con el resto de los derivados: lo mira,
    // y declararlo antes lo leía en su zona muerta temporal. No reventaba en el
    // paso 1 —el `&&` cortaba antes de llegar— sino al entrar al formulario,
    // que es donde `paso === 'formulario'` deja pasar la condición.
    // El render propio trae su propio layout (split lateralizado): la columna de
    // resumen al lado lo estorbaría, así que ahí no va.
    const conResumen = esAsistente && !enviada && paso === 'formulario' && !!model
        && tipo?.tema?.render !== 'propio';
    // Va en xl: y no en lg: porque a 1024px la columna de 20rem dejaría el
    // formulario en 648px, más angosto que los 768px que tiene hoy sin columna.
    // Bajo ese ancho el resumen cae abajo y el formulario conserva el suyo.
    const grilla = esFicha
        ? 'flex flex-col gap-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start'
        : conResumen
            ? 'flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start'
            : '';

    // El handler se engancha aparte para leer la fecha vigente sin recrear el
    // modelo (recrearlo en cada tecla borraría lo escrito en el formulario).
    useEffect(() => {
        if (!model || soloLectura) return undefined;
        const alCompletar = (_, opciones) => {
            // Red de seguridad: el botón ya está deshabilitado, pero survey-core
            // también completa con Enter desde la última pregunta.
            if (trabaEnvio) {
                opciones.allow = false;
                setError(trabaEnvio);
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
                    setSucio(false);
                    setRecarga((n) => n + 1);
                    // Se vuelve a la ficha: ahí está el aviso de que el cambio
                    // espera respuesta, y quedarse en el formulario invitaba a
                    // mandar otro encima.
                    navegar(`/tickets/t/${ticket.id}`, { replace: true });
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
    }, [model, reservaId, tramo, trabaEnvio, ticket, tipo, soloLectura, manejar]);

    // El botón de enviar queda apagado mientras falte la fecha o el plazo esté
    // vencido: es preferible a dejar llenar todo y rebotar al final. Si una
    // versión de survey-core no expone la acción, el guard de onCompleting
    // sigue cubriendo el caso.
    useEffect(() => {
        const accion = model?.navigationBar?.getActionById?.('sv-nav-complete');
        if (!accion) return;
        accion.enabled = !trabaEnvio;
        accion.tooltip = trabaEnvio || undefined;
    }, [model, trabaEnvio]);

    // Marca que hay respuestas sin guardar, y refresca el resumen de la derecha.
    // Las dos cosas cuelgan del mismo evento a propósito: engancharlo dos veces
    // obliga a survey-core a redibujar todos sus textos cada vez.
    useEffect(() => {
        if (!model || soloLectura) return undefined;
        const alCambiar = () => {
            setSucio(true);
            setVivo(leerVivo(model));
            setDatosVivos({ ...model.data });
        };
        model.onValueChanged.add(alCambiar);
        return () => model.onValueChanged.remove(alCambiar);
    }, [model, soloLectura, leerVivo]);

    // `onValueChanged` solo avisa de cambios, así que lo ya respondido —un
    // ticket que se está editando, o un `defaultValue`— no entraría nunca.
    useEffect(() => {
        setVivo(leerVivo(model));
        setDatosVivos(model ? { ...model.data } : null);
    }, [model, leerVivo]);

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

    // Una solicitud que ya no admite cambios no tiene vista de modificación:
    // /modificar mostraría un formulario congelado y sin botón. Se vuelve a la
    // ficha, que es donde dice por qué.
    if (modificando && ticket && !ticket.editable) {
        return <Navigate to={`/tickets/t/${ticket.id}`} replace />;
    }

    return (
        // Mismo truco que FormPublico: survey-core pinta el fondo con
        // --sjs2-color-utility-body solo dentro de su caja; con las variables
        // en la página entera, el resto del viewport resuelve el mismo color.
        <PortalLayout ancho={ticket || paso === 'formulario' ? 'max-w-6xl' : 'max-w-3xl'}
            estilo={model ? { ...model.themeVariables, background: 'var(--sjs2-color-utility-body)' } : undefined}>
            {/* Header superior: el botón de volver pegado a la izquierda y, a la
                misma altura, los pasos del asistente. Juntarlos en una fila sube
                el formulario y evita el scroll cuando se despliegan las tarjetas.
                Enviada la solicitud, la salida es el botón de abajo: dos formas
                de volver a lo mismo en una pantalla de acuse sobran. */}
            {!enviada && (
                <div className="mb-4 flex items-center justify-between gap-3">
                    <Link to={modificando && ticket ? `/tickets/t/${ticket.id}` : '/tickets'} onClick={alSalir}
                        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
                        <span className="material-symbols-outlined text-lg">arrow_back</span>
                        {modificando && ticket ? 'Volver a la solicitud' : 'Mis solicitudes'}
                    </Link>

                    {/* Dos pasos, dos rótulos, a la altura del botón de volver. */}
                    {!soloLectura && esAsistente && tipo && (
                        <ol className="flex items-center gap-3 text-sm">
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
                </div>
            )}

            {/* Con ticket: seguimiento en una columna fija a la izquierda. En
                pantallas chicas no cabe al lado y baja después del formulario. */}
            <div className={grilla}>
            {esFicha && (
                <aside className="order-last lg:sticky lg:top-20 lg:order-none lg:h-[calc(100vh-9rem)]">
                    {/* El usuario del portal recibe el seguimiento, no conversa:
                        lo que tenga que decir va en una solicitud de cambio, que
                        es lo que el administrador resuelve. */}
                    <Seguimiento columna ticket={ticket} />
                </aside>
            )}
            <div className="min-w-0">

            {esFicha && (
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
                    {/* Modificar abre su propia pantalla en vez de desplegar
                        el formulario acá abajo: son dos cosas distintas y la
                        ficha es para mirar en qué quedó la solicitud. */}
                    {ticket.editable && !cancelando && (
                        <Link to={`/tickets/t/${ticket.id}/modificar`}
                            className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                            <span className="material-symbols-outlined text-base">edit</span>
                            Solicitud de modificación
                        </Link>
                    )}
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
            {esFicha && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                    <p className="text-sm font-medium text-slate-800">Lo que pediste</p>
                    {ticket.hora_inicio && (
                        <>
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
                        </>
                    )}

                    {/* Las respuestas, no solo la fecha: para decidir si hace falta
                        cambiar algo hay que poder leer lo que uno contestó sin
                        bajar hasta el formulario. */}
                    {respondido.length > 0 && (
                        <dl className="mt-3 border-t border-slate-100 pt-1">
                            {respondido.map((c) => (
                                <div key={c.name}
                                    className="-mx-2 grid grid-cols-1 gap-x-6 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50 sm:grid-cols-[14rem_minmax(0,1fr)]">
                                    <dt className="text-sm text-slate-500">
                                        {c.title}
                                        {c.fueraDelFormulario && (
                                            <span className="ml-1 text-xs text-slate-400">(ya no se pregunta)</span>
                                        )}
                                    </dt>
                                    <dd className="text-sm text-slate-900">
                                        <Desglosado valores={valoresDe(ticket.datos?.[c.name], etqs)} />
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>
            )}

            {!soloLectura && esAsistente && !enviada && paso === 'reserva' && tipo && (
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
            {paso === 'formulario' && !soloLectura && esAsistente && !enviada && reserva && (
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
            {paso === 'formulario' && !soloLectura && esAsistente && !enviada && traba && (
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

            {/* Sin acción a propósito: esto no se arregla volviendo al paso
                de reservación, sino editando lo que ya está en pantalla. */}
            {paso === 'formulario' && esAsistente && !enviada && !traba && sinCambios && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3" role="status">
                    <p className="text-sm text-slate-600">{SIN_CAMBIOS}</p>
                </div>
            )}

            {/* Enviada, el formulario se desmonta: en su lugar va el carrusel
                de noticias, que reemplaza a la página final de survey-core. */}
            {model && esAsistente && !enviada && paso === 'formulario' && (
                tipo?.tema?.render === 'propio'
                    ? (
                        <div className="animate-entra-lateral overflow-hidden rounded-2xl border border-slate-200">
                            <FormularioPortal model={model} tema={tipo.tema} trabaEnvio={trabaEnvio} />
                        </div>
                    )
                    : (
                        <div className={`animate-entra-lateral overflow-hidden rounded-2xl border border-slate-200${model.modoTarjetas ? ' tema-tarjetas' : ''}`}>
                            <Survey model={model} />
                        </div>
                    )
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
            {conResumen && (
                <aside className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
                    <ResumenVivo reserva={reserva} tramo={tramo} filas={vivo} />
                </aside>
            )}
            </div>
        </PortalLayout>
    );
}
