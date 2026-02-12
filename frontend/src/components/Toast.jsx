import React, { useEffect, useState } from 'react';

/**
 * Toast notification component with slide-in animation.
 * 
 * Props:
 * - message: string — text to display
 * - type: 'success' | 'error' — determines styling
 * - onClose: () => void — called when toast should be removed
 * - duration: number — auto-dismiss time in ms (default 3000)
 */
const Toast = ({ message, type = 'success', onClose, duration = 3000 }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        requestAnimationFrame(() => setIsVisible(true));

        const autoClose = setTimeout(() => {
            handleClose();
        }, duration);

        return () => clearTimeout(autoClose);
    }, []);

    const handleClose = () => {
        setIsLeaving(true);
        setTimeout(() => {
            onClose?.();
        }, 300); // match exit animation duration
    };

    const config = {
        success: {
            bg: 'bg-emerald-50 border-emerald-200',
            icon: 'check_circle',
            iconColor: 'text-emerald-500',
            text: 'text-emerald-800',
            progressBar: 'bg-emerald-400',
        },
        error: {
            bg: 'bg-red-50 border-red-200',
            icon: 'error',
            iconColor: 'text-red-500',
            text: 'text-red-800',
            progressBar: 'bg-red-400',
        },
    };

    const styles = config[type] || config.success;

    return (
        <div
            className={`
                fixed top-6 right-6 z-[9999] max-w-sm w-full
                transform transition-all duration-300 ease-out
                ${isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
            `}
        >
            <div className={`${styles.bg} border rounded-xl shadow-lg overflow-hidden`}>
                <div className="flex items-start gap-3 p-4">
                    <span className={`material-symbols-outlined ${styles.iconColor} text-2xl flex-shrink-0 mt-0.5`}>
                        {styles.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${styles.text} leading-relaxed`}>
                            {message}
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>
                {/* Animated progress bar */}
                <div className="h-1 w-full bg-black/5">
                    <div
                        className={`h-full ${styles.progressBar} rounded-full`}
                        style={{
                            animation: `shrink ${duration}ms linear forwards`,
                        }}
                    />
                </div>
            </div>

            <style>{`
                @keyframes shrink {
                    from { width: 100%; }
                    to { width: 0%; }
                }
            `}</style>
        </div>
    );
};

export default Toast;
