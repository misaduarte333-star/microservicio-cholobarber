'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Página de Inicio de Sesión unificada.
 * Un solo formulario con usuario/correo y contraseña.
 * El backend detecta automáticamente el rol y redirige.
 */
export default function LoginPage() {
    const router = useRouter()
    const [identifier, setIdentifier] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password }),
            })

            const data = await res.json()

            if (!res.ok || !data.success) {
                setError(data.error || 'Error al iniciar sesión')
                return
            }

            // Save session
            sessionStorage.setItem(
                'barbercloud_session',
                JSON.stringify({ role: data.role, user: data.user })
            )

            // Also save barbero session for tablet compatibility
            if (data.role === 'barbero') {
                sessionStorage.setItem('barbero_session', JSON.stringify(data.user))
            }

            window.location.href = data.redirect
        } catch {
            setError('Error al conectar con el servidor')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900" />
            <div
                className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
                style={{ background: 'var(--gradient-brand)' }}
            />
            <div
                className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-10"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' }}
            />

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md px-6 animate-fade-in">
                <div className="glass-card p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-purple-400 shadow-lg shadow-purple-500/30 mb-4">
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold">
                            <span className="gradient-text">BotDynamic</span>{' '}
                            <span className="text-white">Dev</span>
                        </h1>
                        <p className="text-slate-400 mt-2 text-sm">Panel de desarrollo y gestión de negocios</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="login-identifier" className="block text-sm font-medium text-slate-300 mb-2">
                                Correo o usuario
                            </label>
                            <input
                                id="login-identifier"
                                type="text"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                className="input-field"
                                placeholder="correo@ejemplo.com o tu usuario"
                                autoComplete="username"
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="login-password" className="block text-sm font-medium text-slate-300 mb-2">
                                Contraseña
                            </label>
                            <input
                                id="login-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="input-field"
                                placeholder="••••••••"
                                autoComplete="current-password"
                                required
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm animate-slide-in">
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="spinner !w-5 !h-5" />
                                    Ingresando...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                    </svg>
                                    Ingresar
                                </>
                            )}
                        </button>
                    </form>

                    {/* Help */}
                    <p className="text-center text-slate-500 text-xs mt-6">
                        ¿Problemas para acceder? Contacta al administrador
                    </p>
                </div>

                {/* Footer */}
                <p className="text-center text-slate-600 text-xs mt-6">
                    BotDynamic &copy; {new Date().getFullYear()}
                </p>
            </div>
        </div>
    )
}
