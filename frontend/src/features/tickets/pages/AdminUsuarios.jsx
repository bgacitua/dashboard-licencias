import React, { useEffect, useMemo, useState } from 'react';

import AdminMarco from '../components/AdminMarco';
import { estadoUsuario, fechaHora, listarUsuarios, resetUsuario } from '../services/tickets';

const ESTADO = {
    pendiente: 'bg-amber-100 text-amber-800',
    activo: 'bg-green-100 text-green-800',
    inactivo: 'bg-gray-200 text-gray-700',
    rechazado: 'bg-red-100 text-red-800',
};

export default function AdminUsuarios() {
    const [usuarios, setUsuarios] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [error, setError] = useState('');

    const recargar = () => listarUsuarios().then(setUsuarios).catch((e) => setError(e.message));
    useEffect(() => { recargar(); }, []);

    const rechazar = (u) => {
        // ponytail: prompt nativo; un modal si piden dar formato al motivo.
        const motivo = window.prompt(
            `Se rechazará el acceso de ${u.nombre || u.email} y se le avisará por correo.\nMotivo (opcional):`, '',
        );
        if (motivo !== null) accion(() => estadoUsuario(u.id, 'rechazado', motivo.trim() || null));
    };

    const accion = async (fn) => {
        setError('');
        try {
            await fn();
            recargar();
        } catch (e) {
            setError(e.message);
        }
    };

    const reset = (u) => {
        if (!window.confirm(
            `Se borrará la contraseña de ${u.email}. Durante las próximas 24 horas podrá volver a crear su cuenta ` +
            'con una contraseña nueva; hasta entonces no podrá ingresar. ¿Continuar?'
        )) return;
        accion(() => resetUsuario(u.id));
    };

    const visibles = useMemo(() => {
        const t = busqueda.trim().toLowerCase();
        return t ? usuarios.filter((u) => `${u.nombre} ${u.email} ${u.rut}`.toLowerCase().includes(t)) : usuarios;
    }, [usuarios, busqueda]);
    const pendientes = usuarios.filter((u) => u.estado === 'pendiente').length;

    return (
        <AdminMarco acciones={
            <input type="search" placeholder="Buscar por nombre, correo o RUT…" value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        }>
            {pendientes > 0 && (
                <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {pendientes} cuenta{pendientes > 1 ? 's' : ''} esperando activación.
                </p>
            )}
            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                        <tr>
                            <th className="px-4 py-3">Persona</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3">Registro</th>
                            <th className="px-4 py-3">Último ingreso</th>
                            <th className="px-4 py-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {visibles.map((u) => (
                            <tr key={u.id}>
                                <td className="px-4 py-3">
                                    <p className="font-medium text-gray-900">{u.nombre || '—'}</p>
                                    <p className="text-xs text-gray-500">{u.email} · {u.rut}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO[u.estado]}`}>{u.estado}</span>
                                    {!u.tiene_clave && (
                                        <p className="mt-1 text-xs text-gray-500">Sin clave · puede registrarse hasta {fechaHora(u.reset_hasta)}</p>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-gray-600">{fechaHora(u.created_at)}</td>
                                <td className="px-4 py-3 text-gray-600">{fechaHora(u.last_login_at)}</td>
                                <td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
                                    {u.estado === 'pendiente' && (
                                        <button onClick={() => rechazar(u)}
                                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">
                                            Rechazar
                                        </button>
                                    )}
                                    {u.estado !== 'activo' ? (
                                        <button onClick={() => accion(() => estadoUsuario(u.id, 'activo'))}
                                            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                                            Activar
                                        </button>
                                    ) : (
                                        <button onClick={() => accion(() => estadoUsuario(u.id, 'inactivo'))}
                                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
                                            Desactivar
                                        </button>
                                    )}
                                    <button onClick={() => reset(u)} className="text-xs text-red-600 hover:underline">
                                        Restablecer clave
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {visibles.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Sin usuarios.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </AdminMarco>
    );
}
