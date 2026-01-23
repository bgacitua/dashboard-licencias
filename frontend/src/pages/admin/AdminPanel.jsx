import React, { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import { getToken } from '../../services/auth';

const API_URL = 'http://localhost:8000/api/v1';

/**
 * Panel de administración para gestionar usuarios.
 */
const AdminPanel = () => {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newUser, setNewUser] = useState({
        username: '',
        password: '',
        nombre_completo: '',
        email: '',
        rol_id: ''
    });

    // Cargar usuarios y roles
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const headers = {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            };

            const [usersRes, rolesRes] = await Promise.all([
                fetch(`${API_URL}/admin/users`, { headers }),
                fetch(`${API_URL}/admin/roles`, { headers })
            ]);

            if (!usersRes.ok || !rolesRes.ok) {
                throw new Error('Error al cargar datos');
            }

            const usersData = await usersRes.json();
            const rolesData = await rolesRes.json();

            setUsers(usersData);
            setRoles(rolesData);
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

            setShowCreateForm(false);
            setNewUser({ username: '', password: '', nombre_completo: '', email: '', rol_id: '' });
            fetchData();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleToggleActive = async (userId, currentActive) => {
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

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
                <Navbar />
                <div style={{ padding: '40px', textAlign: 'center' }}>
                    <p>Cargando...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#f5f7fa',
            fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
        }}>
            <Navbar />

            <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '30px' 
                }}>
                    <div>
                        <h1 style={{ margin: '0 0 8px 0', color: '#1a1a2e', fontSize: '1.8rem' }}>
                            ⚙️ Panel de Administración
                        </h1>
                        <p style={{ margin: 0, color: '#666' }}>
                            Gestión de usuarios del sistema
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreateForm(true)}
                        style={{
                            backgroundColor: '#6366f1',
                            color: 'white',
                            border: 'none',
                            padding: '12px 24px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            fontWeight: '500'
                        }}
                    >
                        + Nuevo Usuario
                    </button>
                </div>

                {error && (
                    <div style={{
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '20px',
                        color: '#dc2626'
                    }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Modal de crear usuario */}
                {showCreateForm && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000
                    }}>
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '16px',
                            padding: '32px',
                            width: '100%',
                            maxWidth: '450px',
                            boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
                        }}>
                            <h2 style={{ marginTop: 0 }}>Crear Nuevo Usuario</h2>
                            <form onSubmit={handleCreateUser}>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                                        Username *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={newUser.username}
                                        onChange={e => setNewUser({...newUser, username: e.target.value})}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                                        Contraseña *
                                    </label>
                                    <input
                                        type="password"
                                        required
                                        value={newUser.password}
                                        onChange={e => setNewUser({...newUser, password: e.target.value})}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                                        Nombre Completo
                                    </label>
                                    <input
                                        type="text"
                                        value={newUser.nombre_completo}
                                        onChange={e => setNewUser({...newUser, nombre_completo: e.target.value})}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={newUser.email}
                                        onChange={e => setNewUser({...newUser, email: e.target.value})}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>
                                        Rol *
                                    </label>
                                    <select
                                        required
                                        value={newUser.rol_id}
                                        onChange={e => setNewUser({...newUser, rol_id: e.target.value})}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px',
                                            boxSizing: 'border-box'
                                        }}
                                    >
                                        <option value="">Seleccionar rol...</option>
                                        {roles.map(r => (
                                            <option key={r.id} value={r.id}>{r.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateForm(false)}
                                        style={{
                                            flex: 1,
                                            padding: '12px',
                                            backgroundColor: '#f3f4f6',
                                            border: 'none',
                                            borderRadius: '8px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        style={{
                                            flex: 1,
                                            padding: '12px',
                                            backgroundColor: '#6366f1',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontWeight: '500'
                                        }}
                                    >
                                        Crear Usuario
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Tabla de usuarios */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                    overflow: 'hidden'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#f8f9fa' }}>
                            <tr>
                                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Usuario</th>
                                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Nombre</th>
                                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600' }}>Email</th>
                                <th style={{ padding: '16px', textAlign: 'center', fontWeight: '600' }}>Rol</th>
                                <th style={{ padding: '16px', textAlign: 'center', fontWeight: '600' }}>Estado</th>
                                <th style={{ padding: '16px', textAlign: 'center', fontWeight: '600' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user, idx) => (
                                <tr key={user.id} style={{ 
                                    backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa',
                                    borderTop: '1px solid #eee'
                                }}>
                                    <td style={{ padding: '16px' }}>{user.username}</td>
                                    <td style={{ padding: '16px' }}>{user.nombre_completo || '-'}</td>
                                    <td style={{ padding: '16px' }}>{user.email || '-'}</td>
                                    <td style={{ padding: '16px', textAlign: 'center' }}>
                                        <span style={{
                                            backgroundColor: '#e0e7ff',
                                            color: '#4338ca',
                                            padding: '4px 12px',
                                            borderRadius: '12px',
                                            fontSize: '0.85rem',
                                            textTransform: 'capitalize'
                                        }}>
                                            {user.rol?.nombre || 'Sin rol'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'center' }}>
                                        <span style={{
                                            backgroundColor: user.activo ? '#dcfce7' : '#fee2e2',
                                            color: user.activo ? '#166534' : '#dc2626',
                                            padding: '4px 12px',
                                            borderRadius: '12px',
                                            fontSize: '0.85rem'
                                        }}>
                                            {user.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => handleToggleActive(user.id, user.activo)}
                                            style={{
                                                backgroundColor: user.activo ? '#fef2f2' : '#f0fdf4',
                                                color: user.activo ? '#dc2626' : '#166534',
                                                border: 'none',
                                                padding: '6px 12px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            {user.activo ? 'Desactivar' : 'Activar'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Info de roles */}
                <div style={{
                    marginTop: '30px',
                    padding: '20px',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}>
                    <h3 style={{ marginTop: 0, color: '#374151' }}>📋 Roles Disponibles</h3>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {roles.map(role => (
                            <div key={role.id} style={{
                                padding: '12px 16px',
                                backgroundColor: '#f8fafc',
                                borderRadius: '8px',
                                border: '1px solid #e2e8f0'
                            }}>
                                <strong style={{ textTransform: 'capitalize' }}>{role.nombre}</strong>
                                {role.descripcion && (
                                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                                        {role.descripcion}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
