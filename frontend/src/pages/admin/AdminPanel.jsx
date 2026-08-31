import React, { useState, useEffect } from 'react';
import SidebarLayout from '../../components/SidebarLayout';
import { getToken } from '../../services/auth';

const API_URL = '/api/v1';

const authHeaders = () => ({
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
});

// ─── helpers ────────────────────────────────────────────────────────────────

const formatDate = (dateStr) => {
    if (!dateStr) return 'Nunca';
    return new Date(dateStr).toLocaleDateString('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

// Debe cubrir todos los codigos de app.modulos. Un codigo que falte cae en
// 'extension', nunca en el campo `icono` de la BD: ahi hay valores que no son
// ligatures validos de Material Symbols ('calculator'), y el navegador los
// dibuja como texto crudo en vez de como icono.
const MODULE_ICONS = {
    dashboard: 'sensor_door',
    finiquitos: 'description',
    calculadora: 'calculate',
    costos: 'wallet',
    contract_alerts: 'notifications_active',
    seleccion: 'person_search',
    creditos: 'payments',
    asistencia: 'schedule',
    admin: 'settings',
};

// El rol admin ya tiene todos los modulos: no se lista ni se ofrece para asignar.
// El backend lo rechaza igual; esto solo evita mostrar lo que no se puede hacer.
const ROL_OCULTO = 'admin';

// ─── sub-components ─────────────────────────────────────────────────────────

function FieldGroup({ label, children }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-app-muted">{label}</label>
            {children}
        </div>
    );
}

function InputField(props) {
    return (
        <input
            {...props}
            className={`w-full px-3 py-2.5 border border-app-line rounded-xl text-sm text-app-ink
                focus:ring-2 focus:ring-app-brand/30 focus:border-app-brand outline-none transition-shadow
                disabled:bg-app-surface disabled:text-app-outline ${props.className || ''}`}
        />
    );
}

function SelectField({ children, ...props }) {
    return (
        <select
            {...props}
            className="w-full px-3 py-2.5 border border-app-line rounded-xl text-sm text-app-ink
                focus:ring-2 focus:ring-app-brand/30 focus:border-app-brand outline-none transition-shadow"
        >
            {children}
        </select>
    );
}

function ModuleCheckboxList({ modules, selectedIds, onChange }) {
    const toggle = (id, checked) => {
        if (checked) onChange([...selectedIds, id]);
        else onChange(selectedIds.filter(x => x !== id));
    };
    return (
        <div className="max-h-44 overflow-y-auto border border-app-line rounded-xl p-3 space-y-1 bg-app-surface/50">
            {modules.length === 0 && (
                <p className="text-xs text-app-outline py-2 text-center">No hay módulos disponibles</p>
            )}
            {modules.map(m => (
                <label key={m.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-white p-1.5 rounded-lg transition-colors">
                    <input
                        type="checkbox"
                        checked={selectedIds.includes(m.id)}
                        onChange={e => toggle(m.id, e.target.checked)}
                        className="w-4 h-4 accent-app-brand rounded"
                    />
                    <span className="text-sm text-app-muted">{m.nombre}</span>
                </label>
            ))}
        </div>
    );
}

function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-md ">
                <div className="flex items-center justify-between px-6 py-4 border-b border-app-line">
                    <h2 className="text-base font-bold text-app-ink">{title}</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-app-outline hover:text-app-muted hover:bg-app-surface transition-colors"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}

function ModalActions({ onCancel, submitLabel = 'Guardar', danger = false }) {
    return (
        <div className="flex gap-3 pt-4 border-t border-app-line mt-4">
            <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 bg-app-surface text-app-muted rounded-xl text-sm font-semibold hover:bg-app-line transition-colors"
            >
                Cancelar
            </button>
            <button
                type="submit"
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${
                    danger ? 'bg-red-600 hover:bg-red-700' : 'bg-app-brand hover:bg-app-brand/90'
                }`}
            >
                {submitLabel}
            </button>
        </div>
    );
}

// ─── main component ──────────────────────────────────────────────────────────

const AdminPanel = () => {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('users');
    const [searchTerm, setSearchTerm] = useState('');
    const [tabError, setTabError] = useState('');

    // User modals
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newUser, setNewUser] = useState({ username: '', password: '', nombre_completo: '', email: '', rol_id: '', send_invite: false });
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordData, setPasswordData] = useState({ userId: null, newPassword: '' });

    // Role modals
    const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
    const [newRole, setNewRole] = useState({ nombre: '', descripcion: '', modulo_ids: [] });
    const [showEditRoleModal, setShowEditRoleModal] = useState(false);
    const [editingRole, setEditingRole] = useState(null);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            const h = authHeaders();
            const [usersRes, rolesRes, modulesRes] = await Promise.all([
                fetch(`${API_URL}/admin/users`, { headers: h }),
                fetch(`${API_URL}/admin/roles`, { headers: h }),
                fetch(`${API_URL}/admin/modules`, { headers: h }),
            ]);
            if (!usersRes.ok || !rolesRes.ok) throw new Error('Error al cargar datos');
            setUsers(await usersRes.json());
            setRoles(await rolesRes.json());
            setModules(modulesRes.ok ? await modulesRes.json() : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── users ──────────────────────────────────────────────────────────────

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setTabError('');
        try {
            const res = await fetch(`${API_URL}/admin/users`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ ...newUser, rol_id: parseInt(newUser.rol_id) }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Error al crear usuario');
            }
            const created = await res.json().catch(() => ({}));
            setShowCreateModal(false);
            setNewUser({ username: '', password: '', nombre_completo: '', email: '', rol_id: '', send_invite: false });
            if (created.invite_email_failed) {
                setTabError(`Usuario "${created.username}" creado, pero no se pudo enviar el correo de invitación. Usa el botón de reenviar.`);
            }
            fetchData();
        } catch (err) { setTabError(err.message); }
    };

    const handleEditUser = async (e) => {
        e.preventDefault();
        setTabError('');
        try {
            const res = await fetch(`${API_URL}/admin/users/${editingUser.id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    nombre_completo: editingUser.nombre_completo,
                    email: editingUser.email,
                    rol_id: parseInt(editingUser.rol_id),
                }),
            });
            if (!res.ok) throw new Error('Error al actualizar usuario');
            setShowEditModal(false);
            setEditingUser(null);
            fetchData();
        } catch (err) { setTabError(err.message); }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setTabError('');
        try {
            const res = await fetch(`${API_URL}/admin/users/${passwordData.userId}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ password: passwordData.newPassword }),
            });
            if (!res.ok) throw new Error('Error al cambiar contraseña');
            setShowPasswordModal(false);
            setPasswordData({ userId: null, newPassword: '' });
        } catch (err) { setTabError(err.message); }
    };

    const handleResendInvite = async (userId, username) => {
        if (!confirm(`¿Reenviar invitación a "${username}"? El enlace anterior dejará de funcionar.`)) return;
        setTabError('');
        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}/send-invite`, {
                method: 'POST',
                headers: authHeaders(),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Error al reenviar la invitación');
            }
            fetchData();
        } catch (err) { setTabError(err.message); }
    };

    const handleToggleActive = async (userId, currentActive) => {
        if (!confirm(`¿Confirmas ${currentActive ? 'desactivar' : 'activar'} este usuario?`)) return;
        setTabError('');
        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({ activo: !currentActive }),
            });
            if (!res.ok) throw new Error('Error al actualizar usuario');
            fetchData();
        } catch (err) { setTabError(err.message); }
    };

    // ── modules ────────────────────────────────────────────────────────────

    const handleToggleModule = async (moduleId, currentActive) => {
        setTabError('');
        // Optimistic update
        setModules(prev => prev.map(m => m.id === moduleId ? { ...m, activo: !currentActive } : m));
        try {
            // FastAPI reads `active` as query param (simple bool, not in path)
            const res = await fetch(
                `${API_URL}/admin/modules/${moduleId}/toggle?active=${!currentActive}`,
                { method: 'PUT', headers: authHeaders() }
            );
            if (!res.ok) {
                setModules(prev => prev.map(m => m.id === moduleId ? { ...m, activo: currentActive } : m));
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || `Error al ${currentActive ? 'desactivar' : 'activar'} módulo`);
            }
            fetchData();
        } catch (err) {
            setTabError(err.message);
        }
    };

    // ── roles ──────────────────────────────────────────────────────────────

    const handleCreateRole = async (e) => {
        e.preventDefault();
        setTabError('');
        try {
            const res = await fetch(`${API_URL}/admin/roles`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(newRole),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Error al crear rol');
            }
            setShowCreateRoleModal(false);
            setNewRole({ nombre: '', descripcion: '', modulo_ids: [] });
            fetchData();
        } catch (err) { setTabError(err.message); }
    };

    const handleEditRole = async (e) => {
        e.preventDefault();
        setTabError('');
        try {
            const res = await fetch(`${API_URL}/admin/roles/${editingRole.id}`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    nombre: editingRole.nombre,
                    descripcion: editingRole.descripcion,
                    modulo_ids: editingRole.modulo_ids,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Error al actualizar rol');
            }
            setShowEditRoleModal(false);
            setEditingRole(null);
            fetchData();
        } catch (err) { setTabError(err.message); }
    };

    const openEditRole = (role) => {
        setEditingRole({
            ...role,
            modulo_ids: role.modulos?.map(m => m.id) || [],
        });
        setShowEditRoleModal(true);
        setTabError('');
    };

    const openEditUser = (user) => {
        setEditingUser({ ...user, rol_id: user.rol?.id || '' });
        setShowEditModal(true);
        setTabError('');
    };

    const openPasswordModal = (userId) => {
        setPasswordData({ userId, newPassword: '' });
        setShowPasswordModal(true);
        setTabError('');
    };

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.nombre_completo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeModules = modules.filter(m => m.activo);

    // El rol admin no se muestra ni se ofrece en los selectores.
    const rolesVisibles = roles.filter(r => r.nombre !== ROL_OCULTO);

    // ── tabs config ────────────────────────────────────────────────────────

    const tabs = [
        { id: 'users',    label: 'Usuarios',  icon: 'group',     count: users.length },
        { id: 'roles',    label: 'Roles',     icon: 'badge',     count: rolesVisibles.length },
        { id: 'modules',  label: 'Módulos',   icon: 'extension', count: modules.length },
        { id: 'security', label: 'Seguridad', icon: 'shield',    count: null },
    ];

    // ── render ─────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <SidebarLayout>
                <main className="p-8 flex items-center justify-center min-h-screen">
                    <div className="text-center space-y-3">
                        <div className="w-10 h-10 border-[3px] border-app-brand border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-sm text-app-muted">Cargando datos...</p>
                    </div>
                </main>
            </SidebarLayout>
        );
    }

    return (
        <SidebarLayout>
            <main className="p-8">

                {/* Page header */}
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <p className="text-xs font-semibold text-app-brand uppercase tracking-widest mb-1">Sistema</p>
                        <h1 className="text-2xl font-bold text-app-ink tracking-tight">Panel de Administración</h1>
                        <p className="text-app-muted text-sm mt-1">Gestiona usuarios, roles y módulos del sistema.</p>
                    </div>
                    {activeTab === 'users' && (
                        <button
                            onClick={() => { setShowCreateModal(true); setTabError(''); }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-app-brand hover:bg-app-brand/90 text-white rounded-xl text-sm font-semibold transition-colors "
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Nuevo Usuario
                        </button>
                    )}
                    {activeTab === 'roles' && (
                        <button
                            onClick={() => { setShowCreateRoleModal(true); setTabError(''); }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-app-brand hover:bg-app-brand/90 text-white rounded-xl text-sm font-semibold transition-colors "
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Nuevo Rol
                        </button>
                    )}
                </div>

                {/* Global error */}
                {error && (
                    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 text-red-700 text-sm">
                        <span className="material-symbols-outlined text-[18px] flex-shrink-0">error</span>
                        {error}
                    </div>
                )}

                {/* Main card */}
                <div className="bg-white rounded-xl border border-app-line  overflow-hidden">

                    {/* Tabs */}
                    <div className="border-b border-app-line">
                        <nav className="flex">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => { setActiveTab(tab.id); setTabError(''); }}
                                    className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-colors border-b-2 ${
                                        activeTab === tab.id
                                            ? 'text-app-brand border-app-brand bg-app-surface/40'
                                            : 'text-app-muted border-transparent hover:text-app-ink hover:bg-app-surface'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                                    {tab.label}
                                    {tab.count !== null && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                            activeTab === tab.id ? 'bg-app-brand text-white' : 'bg-app-surface text-app-muted'
                                        }`}>
                                            {tab.count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Tab-level error */}
                    {tabError && (
                        <div className="flex items-center gap-3 bg-red-50 border-b border-red-100 px-6 py-3 text-red-700 text-sm">
                            <span className="material-symbols-outlined text-[18px] flex-shrink-0">error</span>
                            {tabError}
                            <button onClick={() => setTabError('')} className="ml-auto text-red-400 hover:text-red-600">
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
                    )}

                    {/* ── Users tab ─────────────────────────────────────── */}
                    {activeTab === 'users' && (
                        <div>
                            <div className="px-6 py-3 border-b border-app-line bg-app-surface/50">
                                <div className="relative max-w-sm">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-app-outline text-[18px]">search</span>
                                    <input
                                        type="text"
                                        placeholder="Buscar usuario, nombre o email..."
                                        className="w-full pl-9 pr-4 py-2 border border-app-line rounded-xl text-sm focus:ring-2 focus:ring-app-brand/30 focus:border-app-brand outline-none"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-app-surface border-b border-app-line">
                                        <tr className="text-xs font-semibold text-app-muted uppercase tracking-wide">
                                            {['Usuario', 'Nombre', 'Email', 'Rol', 'Último Login', 'Estado', ''].map((h, i) => (
                                                <th key={i} className={`px-6 py-3 ${i === 6 ? 'text-right' : ''}`}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-app-line">
                                        {filteredUsers.map(user => (
                                            <tr key={user.id} className="hover:bg-app-surface/60 transition-colors">
                                                <td className="px-6 py-4 font-semibold text-app-ink">{user.username}</td>
                                                <td className="px-6 py-4 text-app-muted">{user.nombre_completo || '—'}</td>
                                                <td className="px-6 py-4 text-app-muted">{user.email || '—'}</td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-app-surface text-app-brand">
                                                        {user.rol?.nombre || 'Sin rol'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-app-muted text-xs">{formatDate(user.last_login)}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                        user.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                                                    }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${user.activo ? 'bg-emerald-500' : 'bg-red-400'}`} />
                                                        {user.activo ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                    {user.invite_pending && (
                                                        <span className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">
                                                            <span className="material-symbols-outlined text-[14px]">hourglass_top</span>
                                                            Invitación pendiente
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button onClick={() => openEditUser(user)} title="Editar"
                                                            className="p-2 text-app-outline hover:text-app-brand hover:bg-app-surface rounded-lg transition-colors">
                                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                                        </button>
                                                        <button onClick={() => openPasswordModal(user.id)} title="Cambiar contraseña"
                                                            className="p-2 text-app-outline hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors">
                                                            <span className="material-symbols-outlined text-[18px]">key</span>
                                                        </button>
                                                        {user.email && !user.last_login && (
                                                            <button
                                                                onClick={() => handleResendInvite(user.id, user.username)}
                                                                title="Reenviar invitación"
                                                                className="p-2 text-app-outline hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                                            >
                                                                <span className="material-symbols-outlined text-[18px]">forward_to_inbox</span>
                                                            </button>
                                                        )}
                                                        <button onClick={() => handleToggleActive(user.id, user.activo)}
                                                            title={user.activo ? 'Desactivar' : 'Activar'}
                                                            className={`p-2 rounded-lg transition-colors ${
                                                                user.activo
                                                                    ? 'text-app-outline hover:text-red-600 hover:bg-red-50'
                                                                    : 'text-app-outline hover:text-emerald-700 hover:bg-emerald-50'
                                                            }`}>
                                                            <span className="material-symbols-outlined text-[18px]">
                                                                {user.activo ? 'person_off' : 'person_check'}
                                                            </span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredUsers.length === 0 && (
                                            <tr>
                                                <td colSpan="7" className="px-6 py-12 text-center text-app-outline text-sm">
                                                    No se encontraron usuarios
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Roles tab ──────────────────────────────────────── */}
                    {activeTab === 'roles' && (
                        <div className="p-6">
                            {rolesVisibles.length === 0 ? (
                                <div className="text-center py-16 text-app-outline">
                                    <div className="w-14 h-14 rounded-xl bg-app-surface flex items-center justify-center mx-auto mb-3">
                                        <span className="material-symbols-outlined text-3xl">badge</span>
                                    </div>
                                    <p className="font-medium text-app-muted">Sin roles creados</p>
                                    <p className="text-sm mt-1">Crea el primer rol con el botón de arriba.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {rolesVisibles.map(role => (
                                        <div key={role.id} className="bg-white rounded-xl border border-app-line  p-5 flex flex-col gap-4 hover: transition-shadow">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-app-surface rounded-xl flex items-center justify-center flex-shrink-0">
                                                        <span className="material-symbols-outlined text-app-brand text-[20px]">badge</span>
                                                    </div>
                                                    <div>
                                                        <h3 className="font-semibold text-app-ink capitalize text-sm">{role.nombre}</h3>
                                                        <p className="text-xs text-app-muted mt-0.5">{role.descripcion || 'Sin descripción'}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => openEditRole(role)}
                                                    title="Editar rol"
                                                    className="p-1.5 text-app-outline hover:text-app-brand hover:bg-app-surface rounded-lg transition-colors flex-shrink-0"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                                </button>
                                            </div>

                                            <div>
                                                <p className="text-[10px] uppercase font-semibold tracking-widest text-app-outline mb-2">Módulos</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {(role.modulos?.length > 0) ? role.modulos.map(mod => (
                                                        <span key={mod.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-app-surface text-app-muted rounded-lg font-medium">
                                                            <span className="material-symbols-outlined text-[14px] text-app-outline">
                                                                {MODULE_ICONS[mod.codigo] || 'extension'}
                                                            </span>
                                                            {mod.nombre}
                                                        </span>
                                                    )) : (
                                                        <span className="text-xs text-app-outline italic">Sin módulos asignados</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Modules tab ────────────────────────────────────── */}
                    {activeTab === 'modules' && (
                        <div className="p-6">
                            {modules.length === 0 ? (
                                <p className="text-center py-12 text-app-outline text-sm">No se encontraron módulos</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {modules.map(mod => (
                                        <div
                                            key={mod.id}
                                            className={`flex items-center justify-between rounded-xl px-4 py-3.5 border transition-colors ${
                                                mod.activo
                                                    ? 'bg-white border-app-line'
                                                    : 'bg-app-surface border-app-line'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                                    mod.activo ? 'bg-app-surface' : 'bg-white'
                                                }`}>
                                                    <span className={`material-symbols-outlined text-[20px] ${
                                                        mod.activo ? 'text-app-brand' : 'text-app-outline'
                                                    }`}>
                                                        {MODULE_ICONS[mod.codigo] || 'extension'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-semibold ${mod.activo ? 'text-app-ink' : 'text-app-outline'}`}>
                                                        {mod.nombre}
                                                    </p>
                                                    <p className="text-xs text-app-outline font-mono">
                                                        {mod.codigo || mod.ruta || '—'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Toggle switch */}
                                            <button
                                                onClick={() => handleToggleModule(mod.id, mod.activo)}
                                                title={mod.activo ? 'Desactivar módulo' : 'Activar módulo'}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-app-brand ${
                                                    mod.activo ? 'bg-app-brand' : 'bg-app-line'
                                                }`}
                                            >
                                                <span className={`inline-block h-4 w-4 rounded-full bg-white  transition-transform ${
                                                    mod.activo ? 'translate-x-6' : 'translate-x-1'
                                                }`} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {/* ── Security tab ───────────────────────────────────── */}
                    {activeTab === 'security' && (
                        <div className="p-6 space-y-6">
                            <div>
                                <h3 className="text-sm font-bold text-app-muted uppercase tracking-widest mb-1">Mi cuenta</h3>
                                <p className="text-xs text-app-outline">Configuración de seguridad para tu usuario administrador.</p>
                            </div>

                            <div className="bg-white rounded-xl border border-app-line p-5 text-sm text-app-muted">
                                La verificación en dos pasos la gestiona Duo Security. Los dispositivos
                                se enrolan y se resetean desde el panel de administración de Duo, no desde
                                esta aplicación.
                            </div>
                        </div>
                    )}
                </div>

                {/* ══ Modals ═══════════════════════════════════════════════ */}

                {/* Create User */}
                {showCreateModal && (
                    <Modal title="Nuevo Usuario" onClose={() => setShowCreateModal(false)}>
                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <FieldGroup label="Username *">
                                <InputField required value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} placeholder="Ej: jperez" />
                            </FieldGroup>
                            <FieldGroup label="Nombre Completo">
                                <InputField value={newUser.nombre_completo} onChange={e => setNewUser({...newUser, nombre_completo: e.target.value})} placeholder="Ej: Juan Pérez" />
                            </FieldGroup>
                            <FieldGroup label="Email corporativo *">
                                <InputField
                                    type="email"
                                    required
                                    value={newUser.email}
                                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                                    placeholder="usuario@cramer.cl"
                                    pattern=".*@cramer\.cl$"
                                    title="Debe ser un correo @cramer.cl"
                                />
                            </FieldGroup>
                            <FieldGroup label="Rol *">
                                <SelectField required value={newUser.rol_id} onChange={e => setNewUser({...newUser, rol_id: e.target.value})}>
                                    <option value="">Seleccionar rol...</option>
                                    {rolesVisibles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                </SelectField>
                            </FieldGroup>

                            {/* Toggle: admin sets password vs invite */}
                            <div className="rounded-xl border border-app-line overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setNewUser({...newUser, send_invite: false, password: ''})}
                                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors text-left ${!newUser.send_invite ? 'bg-app-brand text-white' : 'bg-app-surface text-app-muted hover:bg-app-surface'}`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">lock</span>
                                    Establecer contraseña ahora
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNewUser({...newUser, send_invite: true, password: ''})}
                                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors text-left border-t border-app-line ${newUser.send_invite ? 'bg-app-brand text-white' : 'bg-app-surface text-app-muted hover:bg-app-surface'}`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">mail</span>
                                    Invitar por email — el usuario crea su contraseña
                                </button>
                            </div>

                            {!newUser.send_invite && (
                                <FieldGroup label="Contraseña *">
                                    <InputField type="password" required={!newUser.send_invite} value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} placeholder="Mínimo 6 caracteres" minLength={6} />
                                </FieldGroup>
                            )}

                            <ModalActions onCancel={() => setShowCreateModal(false)} submitLabel="Crear Usuario" />
                        </form>
                    </Modal>
                )}

                {/* Edit User */}
                {showEditModal && editingUser && (
                    <Modal title="Editar Usuario" onClose={() => setShowEditModal(false)}>
                        <form onSubmit={handleEditUser} className="space-y-4">
                            <FieldGroup label="Username">
                                <InputField disabled value={editingUser.username} />
                            </FieldGroup>
                            <FieldGroup label="Nombre Completo">
                                <InputField value={editingUser.nombre_completo || ''} onChange={e => setEditingUser({...editingUser, nombre_completo: e.target.value})} />
                            </FieldGroup>
                            <FieldGroup label="Email corporativo *">
                                <InputField
                                    type="email"
                                    required
                                    value={editingUser.email || ''}
                                    onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                                    placeholder="usuario@cramer.cl"
                                    pattern=".*@cramer\.cl$"
                                    title="Debe ser un correo @cramer.cl"
                                />
                            </FieldGroup>
                            <FieldGroup label="Rol">
                                <SelectField value={editingUser.rol_id} onChange={e => setEditingUser({...editingUser, rol_id: e.target.value})}>
                                    <option value="">Sin rol</option>
                                    {roles
                                        .filter(r => r.nombre !== ROL_OCULTO || r.id === editingUser.rol?.id)
                                        .map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                </SelectField>
                            </FieldGroup>
                            <ModalActions onCancel={() => setShowEditModal(false)} submitLabel="Guardar Cambios" />
                        </form>
                    </Modal>
                )}

                {/* Change Password */}
                {showPasswordModal && (
                    <Modal title="Cambiar Contraseña" onClose={() => setShowPasswordModal(false)}>
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <FieldGroup label="Nueva Contraseña *">
                                <InputField
                                    type="password" required minLength={6}
                                    value={passwordData.newPassword}
                                    onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                                    placeholder="Mínimo 6 caracteres"
                                />
                            </FieldGroup>
                            <ModalActions onCancel={() => setShowPasswordModal(false)} submitLabel="Cambiar Contraseña" />
                        </form>
                    </Modal>
                )}

                {/* Create Role */}
                {showCreateRoleModal && (
                    <Modal title="Nuevo Rol" onClose={() => setShowCreateRoleModal(false)}>
                        <form onSubmit={handleCreateRole} className="space-y-4">
                            <FieldGroup label="Nombre del Rol *">
                                <InputField
                                    required value={newRole.nombre}
                                    onChange={e => setNewRole({...newRole, nombre: e.target.value})}
                                    placeholder="Ej: supervisor"
                                />
                            </FieldGroup>
                            <FieldGroup label="Descripción">
                                <InputField
                                    value={newRole.descripcion}
                                    onChange={e => setNewRole({...newRole, descripcion: e.target.value})}
                                    placeholder="Describe las responsabilidades del rol"
                                />
                            </FieldGroup>
                            <FieldGroup label="Módulos Asignados">
                                <ModuleCheckboxList
                                    modules={modules}
                                    selectedIds={newRole.modulo_ids}
                                    onChange={ids => setNewRole({...newRole, modulo_ids: ids})}
                                />
                            </FieldGroup>
                            <ModalActions onCancel={() => setShowCreateRoleModal(false)} submitLabel="Crear Rol" />
                        </form>
                    </Modal>
                )}

                {/* Edit Role */}
                {showEditRoleModal && editingRole && (
                    <Modal title="Editar Rol" onClose={() => setShowEditRoleModal(false)}>
                        <form onSubmit={handleEditRole} className="space-y-4">
                            <FieldGroup label="Nombre del Rol *">
                                <InputField
                                    required value={editingRole.nombre}
                                    onChange={e => setEditingRole({...editingRole, nombre: e.target.value})}
                                />
                            </FieldGroup>
                            <FieldGroup label="Descripción">
                                <InputField
                                    value={editingRole.descripcion || ''}
                                    onChange={e => setEditingRole({...editingRole, descripcion: e.target.value})}
                                />
                            </FieldGroup>
                            <FieldGroup label="Módulos Asignados">
                                <ModuleCheckboxList
                                    modules={modules}
                                    selectedIds={editingRole.modulo_ids || []}
                                    onChange={ids => setEditingRole({...editingRole, modulo_ids: ids})}
                                />
                            </FieldGroup>
                            <ModalActions onCancel={() => setShowEditRoleModal(false)} submitLabel="Guardar Cambios" />
                        </form>
                    </Modal>
                )}

            </main>
        </SidebarLayout>
    );
};

export default AdminPanel;
