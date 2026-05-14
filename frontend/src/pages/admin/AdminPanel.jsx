import React, { useState, useEffect } from 'react';
import SidebarLayout from '../../components/SidebarLayout';
import { getToken } from '../../services/auth';
import TwoFactorSetup from '../../components/TwoFactorSetup';

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

const MODULE_ICONS = {
    dashboard: 'dashboard',
    finiquitos: 'description',
    calculadora: 'calculate',
    costos: 'wallet',
    contract_alerts: 'notifications_active',
    seleccion: 'person_search',
    admin: 'settings',
};

// ─── sub-components ─────────────────────────────────────────────────────────

function FieldGroup({ label, children }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600">{label}</label>
            {children}
        </div>
    );
}

function InputField(props) {
    return (
        <input
            {...props}
            className={`w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800
                focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-shadow
                disabled:bg-slate-50 disabled:text-slate-400 ${props.className || ''}`}
        />
    );
}

function SelectField({ children, ...props }) {
    return (
        <select
            {...props}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800
                focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-shadow"
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
        <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl p-3 space-y-1 bg-slate-50/50">
            {modules.length === 0 && (
                <p className="text-xs text-slate-400 py-2 text-center">No hay módulos disponibles</p>
            )}
            {modules.map(m => (
                <label key={m.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-white p-1.5 rounded-lg transition-colors">
                    <input
                        type="checkbox"
                        checked={selectedIds.includes(m.id)}
                        onChange={e => toggle(m.id, e.target.checked)}
                        className="w-4 h-4 accent-primary rounded"
                    />
                    <span className="text-sm text-slate-700">{m.nombre}</span>
                </label>
            ))}
        </div>
    );
}

function Modal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-base font-bold text-slate-900">{title}</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
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
        <div className="flex gap-3 pt-4 border-t border-slate-100 mt-4">
            <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
                Cancelar
            </button>
            <button
                type="submit"
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${
                    danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-hover'
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
    const [newUser, setNewUser] = useState({ username: '', password: '', nombre_completo: '', email: '', rol_id: '', modulo_ids: [] });
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
            setShowCreateModal(false);
            setNewUser({ username: '', password: '', nombre_completo: '', email: '', rol_id: '', modulo_ids: [] });
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
                    modulo_ids: editingUser.modulo_ids,
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

    const handleReset2FA = async (userId, username) => {
        if (!confirm(`¿Resetear 2FA para "${username}"? El usuario deberá configurarlo nuevamente en su próximo login.`)) return;
        setTabError('');
        try {
            const res = await fetch(`${API_URL}/admin/users/${userId}/2fa`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Error al resetear 2FA');
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
        setEditingUser({ ...user, rol_id: user.rol?.id || '', modulo_ids: user.modulos?.map(m => m.id) || [] });
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

    // ── tabs config ────────────────────────────────────────────────────────

    const tabs = [
        { id: 'users',    label: 'Usuarios',  icon: 'group',     count: users.length },
        { id: 'roles',    label: 'Roles',     icon: 'badge',     count: roles.length },
        { id: 'modules',  label: 'Módulos',   icon: 'extension', count: modules.length },
        { id: 'security', label: 'Seguridad', icon: 'shield',    count: null },
    ];

    // ── render ─────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <SidebarLayout>
                <main className="p-8 flex items-center justify-center min-h-screen">
                    <div className="text-center space-y-3">
                        <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-sm text-slate-500">Cargando datos...</p>
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
                        <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">Sistema</p>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Panel de Administración</h1>
                        <p className="text-slate-500 text-sm mt-1">Gestiona usuarios, roles y módulos del sistema.</p>
                    </div>
                    {activeTab === 'users' && (
                        <button
                            onClick={() => { setShowCreateModal(true); setTabError(''); }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Nuevo Usuario
                        </button>
                    )}
                    {activeTab === 'roles' && (
                        <button
                            onClick={() => { setShowCreateRoleModal(true); setTabError(''); }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
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
                <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">

                    {/* Tabs */}
                    <div className="border-b border-slate-100">
                        <nav className="flex">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => { setActiveTab(tab.id); setTabError(''); }}
                                    className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold transition-colors border-b-2 ${
                                        activeTab === tab.id
                                            ? 'text-primary border-primary bg-primary-soft/40'
                                            : 'text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                                    {tab.label}
                                    {tab.count !== null && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                            activeTab === tab.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
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
                            <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50">
                                <div className="relative max-w-sm">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                    <input
                                        type="text"
                                        placeholder="Buscar usuario, nombre o email..."
                                        className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                            {['Usuario', 'Nombre', 'Email', 'Rol', 'Último Login', 'Estado', '2FA', ''].map((h, i) => (
                                                <th key={i} className={`px-6 py-3 ${i === 7 ? 'text-right' : ''}`}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredUsers.map(user => (
                                            <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-6 py-4 font-semibold text-slate-800">{user.username}</td>
                                                <td className="px-6 py-4 text-slate-600">{user.nombre_completo || '—'}</td>
                                                <td className="px-6 py-4 text-slate-500">{user.email || '—'}</td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-soft text-primary">
                                                        {user.rol?.nombre || 'Sin rol'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-500 text-xs">{formatDate(user.last_login)}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                                        user.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                                                    }`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${user.activo ? 'bg-emerald-500' : 'bg-red-400'}`} />
                                                        {user.activo ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                                                        user.totp_enabled ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-400'
                                                    }`}>
                                                        <span className="material-symbols-outlined text-[14px]">
                                                            {user.totp_enabled ? 'verified_user' : 'shield'}
                                                        </span>
                                                        {user.totp_enabled ? 'Activo' : 'Sin 2FA'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button onClick={() => openEditUser(user)} title="Editar"
                                                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary-soft rounded-lg transition-colors">
                                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                                        </button>
                                                        <button onClick={() => openPasswordModal(user.id)} title="Cambiar contraseña"
                                                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                                                            <span className="material-symbols-outlined text-[18px]">key</span>
                                                        </button>
                                                        {user.totp_enabled && (
                                                            <button
                                                                onClick={() => handleReset2FA(user.id, user.username)}
                                                                title="Resetear 2FA"
                                                                className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                                            >
                                                                <span className="material-symbols-outlined text-[18px]">phonelink_erase</span>
                                                            </button>
                                                        )}
                                                        <button onClick={() => handleToggleActive(user.id, user.activo)}
                                                            title={user.activo ? 'Desactivar' : 'Activar'}
                                                            className={`p-2 rounded-lg transition-colors ${
                                                                user.activo
                                                                    ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                                                    : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
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
                                                <td colSpan="7" className="px-6 py-12 text-center text-slate-400 text-sm">
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
                            {roles.length === 0 ? (
                                <div className="text-center py-16 text-slate-400">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                                        <span className="material-symbols-outlined text-3xl">badge</span>
                                    </div>
                                    <p className="font-medium text-slate-500">Sin roles creados</p>
                                    <p className="text-sm mt-1">Crea el primer rol con el botón de arriba.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {roles.map(role => (
                                        <div key={role.id} className="bg-white rounded-xl border border-slate-200 shadow-card p-5 flex flex-col gap-4 hover:shadow-card-hover transition-shadow">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-primary-soft rounded-xl flex items-center justify-center flex-shrink-0">
                                                        <span className="material-symbols-outlined text-primary text-[20px]">badge</span>
                                                    </div>
                                                    <div>
                                                        <h3 className="font-semibold text-slate-900 capitalize text-sm">{role.nombre}</h3>
                                                        <p className="text-xs text-slate-500 mt-0.5">{role.descripcion || 'Sin descripción'}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => openEditRole(role)}
                                                    title="Editar rol"
                                                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-soft rounded-lg transition-colors flex-shrink-0"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                                </button>
                                            </div>

                                            <div>
                                                <p className="text-[10px] uppercase font-semibold tracking-widest text-slate-400 mb-2">Módulos</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {(role.modulos?.length > 0) ? role.modulos.map(mod => (
                                                        <span key={mod.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-lg font-medium">
                                                            <span className="material-symbols-outlined text-[14px] text-slate-400">
                                                                {MODULE_ICONS[mod.codigo] || 'extension'}
                                                            </span>
                                                            {mod.nombre}
                                                        </span>
                                                    )) : (
                                                        <span className="text-xs text-slate-400 italic">Sin módulos asignados</span>
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
                                <p className="text-center py-12 text-slate-400 text-sm">No se encontraron módulos</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {modules.map(mod => (
                                        <div
                                            key={mod.id}
                                            className={`flex items-center justify-between rounded-xl px-4 py-3.5 border transition-colors ${
                                                mod.activo
                                                    ? 'bg-white border-slate-200'
                                                    : 'bg-slate-50 border-slate-100'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                                    mod.activo ? 'bg-primary-soft' : 'bg-slate-100'
                                                }`}>
                                                    <span className={`material-symbols-outlined text-[20px] ${
                                                        mod.activo ? 'text-primary' : 'text-slate-400'
                                                    }`}>
                                                        {MODULE_ICONS[mod.codigo] || mod.icono || 'extension'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-semibold ${mod.activo ? 'text-slate-800' : 'text-slate-400'}`}>
                                                        {mod.nombre}
                                                    </p>
                                                    <p className="text-xs text-slate-400 font-mono">
                                                        {mod.codigo || mod.ruta || '—'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Toggle switch */}
                                            <button
                                                onClick={() => handleToggleModule(mod.id, mod.activo)}
                                                title={mod.activo ? 'Desactivar módulo' : 'Activar módulo'}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary ${
                                                    mod.activo ? 'bg-primary' : 'bg-slate-200'
                                                }`}
                                            >
                                                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
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
                                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-1">Mi cuenta</h3>
                                <p className="text-xs text-slate-400">Configuración de seguridad para tu usuario administrador.</p>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 p-5">
                                <TwoFactorSetup />
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
                            <FieldGroup label="Contraseña *">
                                <InputField type="password" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} placeholder="Mínimo 6 caracteres" minLength={6} />
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
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                </SelectField>
                            </FieldGroup>
                            <FieldGroup label="Módulos Permitidos">
                                <ModuleCheckboxList
                                    modules={activeModules}
                                    selectedIds={newUser.modulo_ids}
                                    onChange={ids => setNewUser({...newUser, modulo_ids: ids})}
                                />
                            </FieldGroup>
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
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                                </SelectField>
                            </FieldGroup>
                            <FieldGroup label="Módulos Permitidos">
                                <ModuleCheckboxList
                                    modules={activeModules}
                                    selectedIds={editingUser.modulo_ids || []}
                                    onChange={ids => setEditingUser({...editingUser, modulo_ids: ids})}
                                />
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
