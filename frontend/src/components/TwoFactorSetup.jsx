import React, { useState } from 'react';
import { setup2FA, confirmSetup2FA, disable2FA } from '../services/auth';
import { useAuth } from '../context/AuthContext';

/**
 * Componente para activar/desactivar 2FA desde el perfil del usuario.
 * Uso: <TwoFactorSetup />
 *
 * El campo `user.totp_enabled` debe existir en el objeto usuario del contexto.
 * Después de activar/desactivar, llama logout() para forzar re-login seguro.
 */
const TwoFactorSetup = () => {
    const { user, logout } = useAuth();
    const is2FAEnabled = user?.totp_enabled ?? false;

    const [phase, setPhase] = useState('idle'); // 'idle' | 'setup' | 'confirm' | 'disable'
    const [setupData, setSetupData] = useState(null);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const reset = () => {
        setPhase('idle');
        setSetupData(null);
        setCode('');
        setPassword('');
        setError('');
    };

    const handleStartSetup = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await setup2FA();
            setSetupData(data);
            setPhase('confirm');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmSetup = async (e) => {
        e.preventDefault();
        const clean = code.replace(/\D/g, '');
        if (clean.length !== 6) {
            setError('Ingresa el código de 6 dígitos.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await confirmSetup2FA(clean);
            // Forzar re-login para que el token refleje estado actualizado
            await logout();
        } catch (err) {
            setError(err.message);
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    const handleDisable = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await disable2FA(password);
            await logout();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (phase === 'confirm' && setupData) {
        return (
            <div className="space-y-6">
                <div>
                    <h3 className="text-base font-semibold text-slate-900">Configurar app autenticadora</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        Escanea el código QR con Google Authenticator, Authy u otra app compatible.
                    </p>
                </div>

                <div className="flex flex-col items-center gap-4">
                    <img
                        src={setupData.qr_image_b64}
                        alt="Código QR para 2FA"
                        className="w-48 h-48 rounded-xl border border-slate-200 shadow-sm"
                    />
                    <div className="text-center">
                        <p className="text-xs text-slate-500 mb-1">¿No puedes escanear? Ingresa este código manualmente:</p>
                        <code className="text-sm font-mono bg-slate-100 px-3 py-1.5 rounded-lg text-slate-800 tracking-widest select-all">
                            {setupData.secret}
                        </code>
                    </div>
                </div>

                <form onSubmit={handleConfirmSetup} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="totp-confirm" className="block text-sm font-semibold text-slate-700">
                            Código de verificación
                        </label>
                        <input
                            id="totp-confirm"
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            autoComplete="one-time-code"
                            disabled={loading}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-300 text-center text-xl font-mono tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-slate-100"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px]">error</span>
                            {error}
                        </p>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={reset}
                            disabled={loading}
                            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || code.length !== 6}
                            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Activando…' : 'Activar 2FA'}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    if (phase === 'disable') {
        return (
            <div className="space-y-5">
                <div>
                    <h3 className="text-base font-semibold text-slate-900">Desactivar verificación en dos pasos</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        Ingresa tu contraseña actual para confirmar.
                    </p>
                </div>

                <form onSubmit={handleDisable} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="disable-password" className="block text-sm font-semibold text-slate-700">
                            Contraseña actual
                        </label>
                        <input
                            id="disable-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Tu contraseña"
                            autoComplete="current-password"
                            disabled={loading}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 disabled:bg-slate-100"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px]">error</span>
                            {error}
                        </p>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={reset}
                            disabled={loading}
                            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !password}
                            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Desactivando…' : 'Desactivar 2FA'}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    // Idle: mostrar estado actual
    return (
        <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${is2FAEnabled ? 'bg-green-100' : 'bg-slate-100'}`}>
                    <span className={`material-symbols-outlined text-xl ${is2FAEnabled ? 'text-green-600' : 'text-slate-400'}`}>
                        {is2FAEnabled ? 'verified_user' : 'shield'}
                    </span>
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-900">Verificación en dos pasos</p>
                    <p className="text-xs text-slate-500">
                        {is2FAEnabled ? 'Activa — tu cuenta está protegida con TOTP' : 'Desactivada — habilita para mayor seguridad'}
                    </p>
                </div>
            </div>

            {is2FAEnabled ? (
                <button
                    onClick={() => setPhase('disable')}
                    className="text-sm text-red-600 hover:text-red-700 font-semibold transition-colors"
                >
                    Desactivar
                </button>
            ) : (
                <button
                    onClick={handleStartSetup}
                    disabled={loading}
                    className="text-sm text-primary hover:text-primary-hover font-semibold transition-colors disabled:opacity-60"
                >
                    {loading ? 'Cargando…' : 'Activar'}
                </button>
            )}
        </div>
    );
};

export default TwoFactorSetup;
