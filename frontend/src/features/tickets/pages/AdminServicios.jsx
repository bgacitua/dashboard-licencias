import React, { useEffect, useState } from 'react';

import AdminMarco from '../components/AdminMarco';
import {
    actualizarServicio, crearServicio, fijarPrecio, listarServicios, verServicio,
} from '../services/tickets';

const control = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const MODOS = {
    fijo: { label: 'Precio fijo', ayuda: 'Se cobra una vez por solicitud.' },
    cantidad: { label: 'Por cantidad', ayuda: 'Se multiplica por la cantidad del formulario.' },
};

const hoy = () => new Date().toISOString().slice(0, 10);

/** Montos en pesos, sin decimales: los precios acá son CLP. */
export const money = (v) => (v === null || v === undefined || v === ''
    ? '—'
    : Number(v).toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }));

const nuevoServicio = () => ({ nombre: '', descripcion: '', modo: 'fijo', activo: true, valor: '', desde: hoy() });

function Precios({ servicio, onCambio }) {
    const [valor, setValor] = useState('');
    const [desde, setDesde] = useState(hoy());
    const [error, setError] = useState('');

    const agregar = async () => {
        setError('');
        try {
            await fijarPrecio(servicio.id, Number(valor), desde);
            setValor('');
            onCambio();
        } catch (e) { setError(e.message); }
    };

    return (
        <section className="mt-6 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Precios</h3>
            <p className="mt-1 text-xs text-gray-500">
                Un precio nuevo cierra al anterior en la víspera. Los ya cargados no se editan:
                cambiarlos movería reportes que ya salieron.
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                    Valor
                    <input type="number" min="0" step="1" className={control} value={valor}
                        onChange={(e) => setValor(e.target.value)} placeholder="0" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                    Vigente desde
                    <input type="date" className={control} value={desde}
                        onChange={(e) => setDesde(e.target.value)} />
                </label>
                <button type="button" onClick={agregar} disabled={valor === '' || !desde}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                    Agregar precio
                </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <table className="mt-4 min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                        <th className="py-2 font-medium">Valor</th>
                        <th className="py-2 font-medium">Desde</th>
                        <th className="py-2 font-medium">Hasta</th>
                        <th className="py-2 font-medium">Cargado por</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {(servicio.precios || []).map((p) => (
                        <tr key={p.id}>
                            <td className="py-2 font-medium">{money(p.valor)}</td>
                            <td className="py-2">{p.desde}</td>
                            <td className="py-2">{p.hasta || <span className="text-green-700">vigente</span>}</td>
                            <td className="py-2 text-gray-500">{p.creado_por || '—'}</td>
                        </tr>
                    ))}
                    {(servicio.precios || []).length === 0 && (
                        <tr><td colSpan={4} className="py-6 text-center text-gray-500">Sin precios cargados.</td></tr>
                    )}
                </tbody>
            </table>
        </section>
    );
}

export default function AdminServicios() {
    const [servicios, setServicios] = useState([]);
    const [verInactivos, setVerInactivos] = useState(false);
    const [abierto, setAbierto] = useState(null);
    const [borrador, setBorrador] = useState(null);
    const [error, setError] = useState('');

    const recargar = () => listarServicios(verInactivos).then(setServicios).catch((e) => setError(e.message));

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { recargar(); }, [verInactivos]);

    const abrir = async (id) => {
        setBorrador(null);
        try { setAbierto(await verServicio(id)); } catch (e) { setError(e.message); }
    };

    const guardar = async () => {
        setError('');
        try {
            if (borrador.id) {
                const { nombre, descripcion, modo, activo } = borrador;
                setAbierto(await actualizarServicio(borrador.id, { nombre, descripcion, modo, activo }));
            } else {
                const { valor, ...resto } = borrador;
                setAbierto(await crearServicio({ ...resto, valor: valor === '' ? null : Number(valor) }));
            }
            setBorrador(null);
            recargar();
        } catch (e) { setError(e.message); }
    };

    const editando = borrador || abierto;

    return (
        <AdminMarco acciones={
            <button type="button" onClick={() => { setAbierto(null); setBorrador(nuevoServicio()); }}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
                Nuevo servicio
            </button>
        }>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-start">
                <div>
                    <label className="mb-2 flex items-center gap-2 text-xs text-gray-600">
                        <input type="checkbox" checked={verInactivos}
                            onChange={(e) => setVerInactivos(e.target.checked)} />
                        Ver también los dados de baja
                    </label>
                    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                        {servicios.map((s) => (
                            <li key={s.id}>
                                <button onClick={() => abrir(s.id)}
                                    className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 ${
                                        abierto?.id === s.id ? 'bg-blue-50' : ''
                                    }`}>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-gray-900">
                                            {s.nombre}
                                        </span>
                                        <span className="text-xs text-gray-500">{MODOS[s.modo]?.label}</span>
                                    </span>
                                    {!s.activo && (
                                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-600">
                                            de baja
                                        </span>
                                    )}
                                    <span className="text-sm font-medium">{money(s.valor_vigente)}</span>
                                </button>
                            </li>
                        ))}
                        {servicios.length === 0 && (
                            <li className="px-4 py-8 text-center text-sm text-gray-500">
                                Sin servicios en el catálogo todavía.
                            </li>
                        )}
                    </ul>
                </div>

                <div>
                    {editando ? (
                        <div className="rounded-xl border border-gray-200 bg-white p-5">
                            <div className="grid gap-3">
                                <label className="flex flex-col gap-1 text-xs text-gray-600">
                                    Nombre
                                    <input className={control} value={editando.nombre}
                                        onChange={(e) => setBorrador({ ...editando, nombre: e.target.value })} />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-gray-600">
                                    Descripción
                                    <input className={control} value={editando.descripcion || ''}
                                        onChange={(e) => setBorrador({ ...editando, descripcion: e.target.value })} />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-gray-600">
                                    Cómo se cobra
                                    <select className={control} value={editando.modo}
                                        onChange={(e) => setBorrador({ ...editando, modo: e.target.value })}>
                                        {Object.entries(MODOS).map(([k, m]) => (
                                            <option key={k} value={k}>{m.label}</option>
                                        ))}
                                    </select>
                                    <span className="text-gray-500">{MODOS[editando.modo]?.ayuda}</span>
                                </label>
                                <label className="flex items-center gap-2 text-xs text-gray-600">
                                    <input type="checkbox" checked={editando.activo}
                                        onChange={(e) => setBorrador({ ...editando, activo: e.target.checked })} />
                                    Activo (aparece en el selector del constructor)
                                </label>

                                {!editando.id && (
                                    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3">
                                        <label className="flex flex-col gap-1 text-xs text-gray-600">
                                            Precio inicial (opcional)
                                            <input type="number" min="0" step="1" className={control}
                                                value={editando.valor}
                                                onChange={(e) => setBorrador({ ...editando, valor: e.target.value })} />
                                        </label>
                                        <label className="flex flex-col gap-1 text-xs text-gray-600">
                                            Vigente desde
                                            <input type="date" className={control} value={editando.desde}
                                                onChange={(e) => setBorrador({ ...editando, desde: e.target.value })} />
                                        </label>
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 flex gap-2">
                                <button type="button" onClick={guardar} disabled={!borrador || !editando.nombre.trim()}
                                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                                    Guardar
                                </button>
                                {borrador && (
                                    <button type="button" onClick={() => setBorrador(null)}
                                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100">
                                        Cancelar
                                    </button>
                                )}
                            </div>

                            {abierto && !borrador && <Precios servicio={abierto} onCambio={() => abrir(abierto.id)} />}
                        </div>
                    ) : (
                        <p className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
                            Elige un servicio para ver su precio y su historial, o crea uno nuevo.
                        </p>
                    )}
                </div>
            </div>
        </AdminMarco>
    );
}
