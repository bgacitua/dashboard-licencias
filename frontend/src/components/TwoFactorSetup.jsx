import React, { useState } from 'react';
import { setup2FA, confirmSetup2FA } from '../services/auth';
import { useAuth } from '../context/AuthContext';

/**
 * Componente para activar 2FA desde el perfil del usuario.
 * Uso: <TwoFactorSetup />
 *
 * 2FA es obligatorio: no se puede desactivar desde el perfil. Si el usuario
 * pierde su dispositivo, un admin resetea el 2FA desde el panel de administración.
 * El campo `user.totp_enabled` debe existir en el objeto usuario del contexto.
 * Después de activar, llama logout() para forzar re-login seguro.
 */
const TwoFactorSetup = () => {
    const { user, logout } = useAuth();
    const is2FAEnabled = user?.totp_enabled ?? false;

    const [phase, setPhase] = useState('idle'); // 'idle' | 'confirm'
    const [setupData, setSetupData] = useState(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const reset = () => {
        setPhase('idle');
        setSetupData(null);
        setCode('');
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

    if (phase === 'confirm' && setupData) {
        return (
            <div className="space-y-6">
                <div>
                    <h3 className="text-base font-semibold text-app-ink">Configurar app autenticadora</h3>
                    <p className="text-sm text-app-muted mt-1">
                        Escanea el código QR con Google Authenticator, Authy u otra app compatible.
                    </p>
                </div>

                <div className="flex flex-col items-center gap-4">
                    <img
                        src={setupData.qr_image_b64}
                        alt="Código QR para 2FA"
                        className="w-48 h-48 rounded-xl border border-app-line "
                    />
                    <div className="text-center">
                        <p className="text-xs text-app-muted mb-1">¿No puedes escanear? Ingresa este código manualmente:</p>
                        <code className="text-sm font-mono bg-app-surface px-3 py-1.5 rounded-lg text-app-ink tracking-widest select-all">
                            {setupData.secret}
                        </code>
                    </div>
                </div>

                <form onSubmit={handleConfirmSetup} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="totp-confirm" className="block text-sm font-semibold text-app-muted">
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
                            className="w-full px-4 py-2.5 rounded-xl border border-app-line bg-white text-app-ink placeholder:text-app-outline text-center text-xl font-mono tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-app-brand/30 focus:border-app-brand disabled:bg-app-surface"
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
                            className="flex-1 py-2.5 rounded-xl border border-app-line text-app-muted text-sm font-semibold hover:bg-app-surface transition-colors disabled:opacity-60"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || code.length !== 6}
                            className="flex-1 py-2.5 rounded-xl bg-app-brand text-white text-sm font-semibold hover:bg-app-brand/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Activando…' : 'Activar 2FA'}
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
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${is2FAEnabled ? 'bg-green-100' : 'bg-app-surface'}`}>
                    <span className={`material-symbols-outlined text-xl ${is2FAEnabled ? 'text-app-brand' : 'text-app-outline'}`}>
                        {is2FAEnabled ? 'verified_user' : 'shield'}
                    </span>
                </div>
                <div>
                    <p className="text-sm font-semibold text-app-ink">Verificación en dos pasos</p>
                    <p className="text-xs text-app-muted">
                        {is2FAEnabled ? 'Activa — tu cuenta está protegida con TOTP' : 'Pendiente — debes activarla para usar la plataforma'}
                    </p>
                </div>
            </div>

            {is2FAEnabled ? (
                <span className="text-xs text-app-muted font-medium">Obligatoria</span>
            ) : (
                <button
                    onClick={handleStartSetup}
                    disabled={loading}
                    className="text-sm text-app-brand hover:text-app-brand font-semibold transition-colors disabled:opacity-60"
                >
                    {loading ? 'Cargando…' : 'Activar'}
                </button>
            )}
        </div>
    );
};

export default TwoFactorSetup;
