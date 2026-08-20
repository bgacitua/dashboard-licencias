import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { initialize2FA, verifyEmailOTP, resendEmailOTP } from '../services/auth';
import AuthShell from '../components/AuthShell';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // 2FA state
    // steps: 'credentials' | 'email-otp' | 'setup' | 'setup-confirm' | 'totp'
    const [step, setStep] = useState('credentials');
    const [preAuthToken, setPreAuthToken] = useState('');
    const [setupToken, setSetupToken] = useState('');
    const [qrToken, setQrToken] = useState('');
    const [setupData, setSetupData] = useState(null);
    const [totpCode, setTotpCode] = useState('');
    const [emailOtpCode, setEmailOtpCode] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);
    const totpInputRef = useRef(null);
    const emailOtpRef = useRef(null);

    const { login, verify2FA, activate2FA, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/menu', { replace: true });
        }
    }, [isAuthenticated, navigate, location]);

    useEffect(() => {
        if ((step === 'totp' || step === 'setup-confirm') && totpInputRef.current) {
            totpInputRef.current.focus();
        }
        if (step === 'email-otp' && emailOtpRef.current) {
            emailOtpRef.current.focus();
        }
    }, [step]);

    // Cooldown timer para reenvío OTP
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    const handleCredentials = async (e) => {
        e.preventDefault();
        setError('');

        if (!username.trim() || !password.trim()) {
            setError('Por favor, completa todos los campos.');
            return;
        }

        setIsLoading(true);
        const result = await login(username, password);

        if (result.success) {
            navigate('/menu', { replace: true });
        } else if (result.requires_2fa) {
            setPreAuthToken(result.pre_auth_token);
            setStep('totp');
        } else if (result.requires_setup) {
            // 2FA obligatorio — OTP enviado al email, mostrar input
            setSetupToken(result.setup_token);
            setEmailOtpCode('');
            setStep('email-otp');
            setResendCooldown(60);
        } else {
            setError(result.error);
        }

        setIsLoading(false);
    };

    const handleTotpVerify = async (e) => {
        e.preventDefault();
        setError('');

        const code = totpCode.replace(/\s/g, '');
        if (code.length !== 6 || !/^\d+$/.test(code)) {
            setError('Ingresa el código de 6 dígitos de tu app autenticadora.');
            return;
        }

        setIsLoading(true);
        const result = await verify2FA(preAuthToken, code);

        if (result.success) {
            navigate('/menu', { replace: true });
        } else {
            setError(result.error || 'Código incorrecto. Inténtalo nuevamente.');
            setTotpCode('');
        }

        setIsLoading(false);
    };

    const handleEmailOTPSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const code = emailOtpCode.replace(/\D/g, '');
        if (code.length !== 6) {
            setError('Ingresa el código de 6 dígitos enviado a tu correo.');
            return;
        }
        setIsLoading(true);
        try {
            const { qr_token } = await verifyEmailOTP(setupToken, code);
            setQrToken(qr_token);
            const qrData = await initialize2FA(qr_token);
            setSetupData(qrData);
            setStep('setup');
        } catch (err) {
            setError(err.message);
            setEmailOtpCode('');
        } finally {
            setIsLoading(false);
        }
    };

    const handleResendOTP = async () => {
        if (resendCooldown > 0) return;
        setError('');
        setIsLoading(true);
        try {
            const { setup_token } = await resendEmailOTP(setupToken);
            setSetupToken(setup_token);
            setEmailOtpCode('');
            setResendCooldown(60);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSetupConfirm = async (e) => {
        e.preventDefault();
        setError('');
        const code = totpCode.replace(/\s/g, '');
        if (code.length !== 6 || !/^\d+$/.test(code)) {
            setError('Ingresa el código de 6 dígitos de tu app autenticadora.');
            return;
        }
        setIsLoading(true);
        const result = await activate2FA(qrToken, code);
        if (result.success) {
            navigate('/menu', { replace: true });
        } else {
            setError(result.error || 'Código incorrecto. Inténtalo nuevamente.');
            setTotpCode('');
        }
        setIsLoading(false);
    };

    const handleBackToCredentials = () => {
        setStep('credentials');
        setPreAuthToken('');
        setSetupToken('');
        setQrToken('');
        setSetupData(null);
        setTotpCode('');
        setEmailOtpCode('');
        setError('');
    };

    const inputClass = 'w-full h-11 rounded-lg border border-app-line bg-white text-[14px] text-app-ink placeholder:text-app-outline transition-colors focus:outline-none focus:border-app-ink focus:ring-1 focus:ring-app-ink disabled:bg-app-surface disabled:cursor-not-allowed';
    const otpClass = `${inputClass} px-3 text-center text-[22px] font-mono tracking-[0.5em] placeholder:tracking-[0.5em]`;
    const primaryBtn = 'w-full h-11 flex items-center justify-center gap-2 rounded-lg bg-app-ink text-white text-[13px] font-semibold transition-colors hover:bg-app-ink/90 focus:outline-none focus:ring-2 focus:ring-app-ink focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';
    const ghostBtn = 'flex items-center justify-center gap-1.5 text-[13px] text-app-muted transition-colors hover:text-app-ink disabled:text-app-line disabled:cursor-not-allowed';
    const labelClass = 'block text-[12px] font-medium text-app-ink';

    const Spinner = () => (
        <svg className="animate-spin h-4 w-4 text-white flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
    );

    const StepHeader = ({ icon, title, subtitle }) => (
        <div className="flex flex-col items-center text-center mb-8">
            {icon && (
                <div className="w-11 h-11 rounded-lg bg-app-surface flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-app-brand text-[22px]">{icon}</span>
                </div>
            )}
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-app-ink">{title}</h1>
            <p className="mt-1.5 text-[14px] text-app-muted">{subtitle}</p>
        </div>
    );

    const errorBox = error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-[#ba1a1a]/30 bg-[#ffdad6] px-4 py-3 text-[13px] text-[#93000a]">
            <span className="material-symbols-outlined text-[18px] mt-px flex-shrink-0">error</span>
            <span>{error}</span>
        </div>
    );

    return (
        <AuthShell>
            {step === 'credentials' ? (
                <>
                    <StepHeader
                        title="Iniciar sesión"
                        subtitle="Ingresa tus credenciales para continuar."
                    />
                    <form onSubmit={handleCredentials} noValidate className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="username" className={labelClass}>Usuario</label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Nombre de usuario"
                                autoComplete="username"
                                disabled={isLoading}
                                className={`${inputClass} px-3`}
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="password" className={labelClass}>Contraseña</label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    disabled={isLoading}
                                    className={`${inputClass} pl-3 pr-11`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    tabIndex={-1}
                                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    className="absolute inset-y-0 right-3 flex items-center text-app-muted transition-colors hover:text-app-ink"
                                >
                                    <span className="material-symbols-outlined text-[20px]">
                                        {showPassword ? 'visibility_off' : 'visibility'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {errorBox}

                        <button type="submit" disabled={isLoading} className={primaryBtn}>
                            {isLoading ? (<><Spinner />Iniciando sesión…</>) : 'Iniciar sesión'}
                        </button>
                    </form>
                </>

            ) : step === 'email-otp' ? (
                /* ── Step 2: Verificar email OTP ── */
                <>
                    <StepHeader
                        icon="mark_email_read"
                        title="Verifica tu correo"
                        subtitle="Enviamos un código de 6 dígitos a tu correo @cramer.cl. Revisa tu bandeja de entrada."
                    />
                    <form onSubmit={handleEmailOTPSubmit} noValidate className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="email-otp" className={labelClass}>Código de verificación</label>
                            <input
                                ref={emailOtpRef}
                                id="email-otp"
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={emailOtpCode}
                                onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="000000"
                                autoComplete="one-time-code"
                                disabled={isLoading}
                                className={otpClass}
                            />
                        </div>

                        {errorBox}

                        <button type="submit" disabled={isLoading || emailOtpCode.length !== 6} className={primaryBtn}>
                            {isLoading ? (<><Spinner />Verificando…</>) : 'Continuar'}
                        </button>

                        <div className="flex items-center justify-between">
                            <button type="button" onClick={handleBackToCredentials} className={ghostBtn}>
                                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                                Volver
                            </button>
                            <button
                                type="button"
                                onClick={handleResendOTP}
                                disabled={resendCooldown > 0 || isLoading}
                                className={`${ghostBtn} font-medium`}
                            >
                                {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código'}
                            </button>
                        </div>
                    </form>
                </>

            ) : step === 'setup' ? (
                /* ── Step 2a: Setup obligatorio — escanear QR ── */
                <>
                    <StepHeader
                        icon="security"
                        title="Verificación en dos pasos"
                        subtitle="Tu cuenta requiere 2FA. Escanea el código QR con Google Authenticator o Authy."
                    />
                    <div className="flex flex-col items-center gap-4 mb-6">
                        {setupData && (
                            <img
                                src={setupData.qr_image_b64}
                                alt="Código QR para configurar 2FA"
                                className="w-48 h-48 rounded-lg border border-app-line"
                            />
                        )}
                        <div className="text-center w-full">
                            <p className="text-[12px] text-app-muted mb-1.5">¿No puedes escanear? Ingresa este código en tu app:</p>
                            <code className="block select-all break-all rounded-lg border border-app-line bg-app-surface px-3 py-2 font-mono text-[12px] tracking-widest text-app-ink">
                                {setupData?.secret}
                            </code>
                        </div>
                    </div>

                    <button
                        onClick={() => { setStep('setup-confirm'); setTotpCode(''); setError(''); }}
                        className={primaryBtn}
                    >
                        Ya escaneé el código
                    </button>

                    <button type="button" onClick={handleBackToCredentials} className={`${ghostBtn} w-full mt-4`}>
                        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                        Volver al inicio de sesión
                    </button>
                </>

            ) : step === 'setup-confirm' ? (
                /* ── Step 2b: Setup obligatorio — confirmar código ── */
                <>
                    <StepHeader
                        icon="verified_user"
                        title="Confirma tu app autenticadora"
                        subtitle="Ingresa el código de 6 dígitos que muestra tu app para activar 2FA."
                    />
                    <form onSubmit={handleSetupConfirm} noValidate className="flex flex-col gap-5">
                        <input
                            ref={totpInputRef}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            value={totpCode}
                            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            autoComplete="one-time-code"
                            aria-label="Código de verificación"
                            disabled={isLoading}
                            className={otpClass}
                        />

                        {errorBox}

                        <button type="submit" disabled={isLoading || totpCode.length !== 6} className={primaryBtn}>
                            {isLoading ? (<><Spinner />Activando…</>) : 'Activar y entrar'}
                        </button>

                        <button
                            type="button"
                            onClick={() => { setStep('setup'); setError(''); }}
                            className={`${ghostBtn} w-full`}
                        >
                            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                            Ver QR nuevamente
                        </button>
                    </form>
                </>

            ) : (
                /* ── Step 3: TOTP verify ── */
                <>
                    <StepHeader
                        icon="shield_lock"
                        title="Verificación de seguridad"
                        subtitle="Abre tu app autenticadora e ingresa el código de 6 dígitos."
                    />
                    <form onSubmit={handleTotpVerify} noValidate className="flex flex-col gap-5">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="totp" className={labelClass}>Código de verificación</label>
                            <input
                                ref={totpInputRef}
                                id="totp"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="000000"
                                autoComplete="one-time-code"
                                disabled={isLoading}
                                className={otpClass}
                            />
                        </div>

                        {errorBox}

                        <button type="submit" disabled={isLoading || totpCode.length !== 6} className={primaryBtn}>
                            {isLoading ? (<><Spinner />Verificando…</>) : 'Verificar'}
                        </button>

                        <button type="button" onClick={handleBackToCredentials} className={`${ghostBtn} w-full`}>
                            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                            Volver al inicio de sesión
                        </button>
                    </form>
                </>
            )}
        </AuthShell>
    );
};

export default Login;
