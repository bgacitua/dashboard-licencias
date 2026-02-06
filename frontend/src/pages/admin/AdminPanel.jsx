import React, { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import { getToken } from '../../services/auth';

const API_URL = 'http://localhost:8000/api/v1';

/**
 * Panel de administración para gestionar usuarios, roles y módulos.
 */
const AdminPanel = () => {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('users');
    
    // Search filter
    const [searchTerm, setSearchTerm] = useState('');
    
    // Create user modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newUser, setNewUser] = useState({
        username: '',
        password: '',
        nombre_completo: '',
        email: '',
        rol_id: ''
    });
    
    // Edit user modal
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    
    // Password change modal
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordData, setPasswordData] = useState({ userId: null, newPassword: '' });

    // Cargar datos
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const headers = {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            };

            const [usersRes, rolesRes, modulesRes] = await Promise.all([
                fetch(`${API_URL}/admin/users`, { headers }),
                fetch(`${API_URL}/admin/roles`, { headers }),
                fetch(`${API_URL}/admin/modules`, { headers })
            ]);

            if (!usersRes.ok || !rolesRes.ok) {
                throw new Error('Error al cargar datos');
            }

            const usersData = await usersRes.json();
            const rolesData = await rolesRes.json();
            const modulesData = modulesRes.ok ? await modulesRes.json() : [];

            setUsers(usersData);
            setRoles(rolesData);
            setModules(modulesData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_URL}/admin/users`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...newUser,
                    rol_id: parseInt(newUser.rol_id)
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Error al crear usuario');
            }

            setShowCreateModal(false);
            setNewUser({ username: '', password: '', nombre_completo: '', email: '', rol_id: '' });
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleEditUser = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_URL}/admin/users/${editingUser.id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nombre_completo: editingUser.nombre_completo,
                    email: editingUser.email,
                    rol_id: parseInt(editingUser.rol_id)
                })
            });

            if (!response.ok) {
                throw new Error('Error al actualizar usuario');
            }

            setShowEditModal(false);
            setEditingUser(null);
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_URL}/admin/users/${passwordData.userId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password: passwordData.newPassword })
            });

            if (!response.ok) {
                throw new Error('Error al cambiar contraseña');
            }

            setShowPasswordModal(false);
            setPasswordData({ userId: null, newPassword: '' });
            alert('Contraseña actualizada exitosamente');
        } catch (err) {
            alert(err.message);
        }
    };

    const handleToggleActive = async (userId, currentActive) => {
        if (!confirm(`¿Estás seguro de ${currentActive ? 'desactivar' : 'activar'} este usuario?`)) {
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/admin/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ activo: !currentActive })
            });

            if (!response.ok) {
                throw new Error('Error al actualizar usuario');
            }

            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleToggleModule = async (moduleId, currentActive) => {
        try {
            const response = await fetch(`${API_URL}/admin/modules/${moduleId}/toggle?active=${!currentActive}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Error al actualizar módulo');
            }

            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const openEditModal = (user) => {
        setEditingUser({
            ...user,
            rol_id: user.rol?.id || ''
        });
        setShowEditModal(true);
    };

    const openPasswordModal = (userId) => {
        setPasswordData({ userId, newPassword: '' });
        setShowPasswordModal(true);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Nunca';
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-CL', { 
            timeZone: 'America/Santiago',
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Filtered users
    const filteredUsers = users.filter(user => 
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.nombre_completo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex min-h-screen bg-[#f8f9fa] font-['Public_Sans']">
                <Sidebar />
                <main className="flex-1 ml-64 p-8 flex items-center justify-center">
                    <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                        <p className="text-gray-500">Cargando datos...</p>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[#f8f9fa] font-['Public_Sans']">
            <Sidebar />
            
            <main className="flex-1 ml-64 p-8">
                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span className="material-symbols-outlined text-lg">home</span>
                        <span>/</span>
                        <span className="text-gray-900 font-medium">Panel de Administración</span>
                    </div>
                </header>

                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-1">Panel de Administración</h1>
                        <p className="text-gray-500">Gestiona usuarios, roles y módulos del sistema.</p>
                    </div>
                    {activeTab === 'users' && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <span className="material-symbols-outlined text-xl">add</span>
                            Nuevo Usuario
                        </button>
                    )}
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700 flex items-center gap-2">
                        <span className="material-symbols-outlined">warning</span>
                        {error}
                    </div>
                )}

                {/* Tabs */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="border-b border-gray-100">
                        <nav className="flex">
                            <button
                                onClick={() => setActiveTab('users')}
                                className={`px-6 py-4 text-sm font-medium transition-colors ${
                                    activeTab === 'users' 
                                        ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' 
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg">group</span>
                                    Usuarios ({users.length})
                                </span>
                            </button>
                            <button
                                onClick={() => setActiveTab('roles')}
                                className={`px-6 py-4 text-sm font-medium transition-colors ${
                                    activeTab === 'roles' 
                                        ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' 
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg">badge</span>
                                    Roles ({roles.length})
                                </span>
                            </button>
                            <button
                                onClick={() => setActiveTab('modules')}
                                className={`px-6 py-4 text-sm font-medium transition-colors ${
                                    activeTab === 'modules' 
                                        ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' 
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg">extension</span>
                                    Módulos ({modules.length})
                                </span>
                            </button>
                        </nav>
                    </div>

                    {/* Users Tab */}
                    {activeTab === 'users' && (
                        <div>
                            {/* Search */}
                            <div className="p-4 border-b border-gray-100 bg-gray-50">
                                <div className="relative max-w-md">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                                    <input
                                        type="text"
                                        placeholder="Buscar por username, nombre o email..."
                                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Users Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                                        <tr>
                                            <th className="px-6 py-3">Usuario</th>
                                            <th className="px-6 py-3">Nombre</th>
                                            <th className="px-6 py-3">Email</th>
                                            <th className="px-6 py-3">Rol</th>
                                            <th className="px-6 py-3">Último Login</th>
                                            <th className="px-6 py-3">Estado</th>
                                            <th className="px-6 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filteredUsers.map((user) => (
                                            <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.username}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{user.nombre_completo || '-'}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600">{user.email || '-'}</td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                                                        {user.rol?.nombre || 'Sin rol'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-500">{formatDate(user.last_login)}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                                        user.activo 
                                                            ? 'bg-green-50 text-green-700' 
                                                            : 'bg-red-50 text-red-700'
                                                    }`}>
                                                        {user.activo ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => openEditModal(user)}
                                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Editar usuario"
                                                        >
                                                            <span className="material-symbols-outlined text-xl">edit</span>
                                                        </button>
                                                        <button
                                                            onClick={() => openPasswordModal(user.id)}
                                                            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                            title="Cambiar contraseña"
                                                        >
                                                            <span className="material-symbols-outlined text-xl">key</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleActive(user.id, user.activo)}
                                                            className={`p-2 rounded-lg transition-colors ${
                                                                user.activo 
                                                                    ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' 
                                                                    : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                                                            }`}
                                                            title={user.activo ? 'Desactivar' : 'Activar'}
                                                        >
                                                            <span className="material-symbols-outlined text-xl">
                                                                {user.activo ? 'person_off' : 'person_check'}
                                                            </span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredUsers.length === 0 && (
                                            <tr>
                                                <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                                                    No se encontraron usuarios
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Roles Tab */}
                    {activeTab === 'roles' && (
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {roles.map(role => (
                                    <div key={role.id} className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                                                <span className="material-symbols-outlined text-indigo-600">badge</span>
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-gray-900 capitalize">{role.nombre}</h3>
                                                <p className="text-xs text-gray-500">{role.descripcion || 'Sin descripción'}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {role.modulos?.map(mod => (
                                                <span key={mod.id} className="text-xs px-2 py-1 bg-white rounded border border-gray-200 text-gray-600">
                                                    {mod.nombre}
                                                </span>
                                            )) || <span className="text-xs text-gray-400">Sin módulos asignados</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Modules Tab */}
                    {activeTab === 'modules' && (
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {modules.map(module => (
                                    <div key={module.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                                module.activo ? 'bg-blue-100' : 'bg-gray-200'
                                            }`}>
                                                <span className={`material-symbols-outlined ${
                                                    module.activo ? 'text-blue-600' : 'text-gray-400'
                                                }`}>
                                                    {module.icono || 'extension'}
                                                </span>
                                            </div>
                                            <div>
                                                <h3 className={`font-semibold ${module.activo ? 'text-gray-900' : 'text-gray-400'}`}>
                                                    {module.nombre}
                                                </h3>
                                                <p className="text-xs text-gray-500">/{module.ruta || module.codigo}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleToggleModule(module.id, module.activo)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                module.activo ? 'bg-blue-600' : 'bg-gray-300'
                                            }`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                module.activo ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Create User Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                            <h2 className="text-xl font-bold text-gray-900 mb-6">Crear Nuevo Usuario</h2>
                            <form onSubmit={handleCreateUser} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                                    <input
                                        type="text"
                                        required
                                        value={newUser.username}
                                        onChange={e => setNewUser({...newUser, username: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
                                    <input
                                        type="password"
                                        required
                                        value={newUser.password}
                                        onChange={e => setNewUser({...newUser, password: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                                    <input
                                        type="text"
                                        value={newUser.nombre_completo}
                                        onChange={e => setNewUser({...newUser, nombre_completo: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={newUser.email}
                                        onChange={e => setNewUser({...newUser, email: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
                                    <select
                                        required
                                        value={newUser.rol_id}
                                        onChange={e => setNewUser({...newUser, rol_id: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Seleccionar rol...</option>
                                        {roles.map(r => (
                                            <option key={r.id} value={r.id}>{r.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateModal(false)}
                                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                    >
                                        Crear Usuario
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Edit User Modal */}
                {showEditModal && editingUser && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                            <h2 className="text-xl font-bold text-gray-900 mb-6">Editar Usuario</h2>
                            <form onSubmit={handleEditUser} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                                    <input
                                        type="text"
                                        disabled
                                        value={editingUser.username}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                                    <input
                                        type="text"
                                        value={editingUser.nombre_completo || ''}
                                        onChange={e => setEditingUser({...editingUser, nombre_completo: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={editingUser.email || ''}
                                        onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                                    <select
                                        value={editingUser.rol_id}
                                        onChange={e => setEditingUser({...editingUser, rol_id: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="">Sin rol</option>
                                        {roles.map(r => (
                                            <option key={r.id} value={r.id}>{r.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditModal(false)}
                                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                    >
                                        Guardar Cambios
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Change Password Modal */}
                {showPasswordModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                            <h2 className="text-xl font-bold text-gray-900 mb-6">Cambiar Contraseña</h2>
                            <form onSubmit={handleChangePassword} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña *</label>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={passwordData.newPassword}
                                        onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="Mínimo 6 caracteres"
                                    />
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswordModal(false)}
                                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium"
                                    >
                                        Cambiar
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default AdminPanel;
