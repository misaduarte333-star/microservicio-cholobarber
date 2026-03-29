'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

interface TableInfo {
    name: string
    count: number | null
    error?: string
}

interface UserRecord {
    id: string
    nombre: string
    email?: string
    usuario_tablet?: string
    sucursal_nombre?: string
}

const DB_TABLES = [
    'sucursales',
    'barberos',
    'servicios',
    'citas',
    'bloqueos',
    'usuarios_admin',
    'costos_fijos',
]

/**
 * Panel de desarrollador.
 * Muestra estado del sistema, información de entorno, tablas de la BD,
 * enlaces rápidos y herramienta de restablecimiento de contraseñas.
 */
export default function DevPage() {
    const router = useRouter()
    const [tables, setTables] = useState<TableInfo[]>([])
    const [loadingTables, setLoadingTables] = useState(true)
    const [envInfo, setEnvInfo] = useState<{ key: string; value: string }[]>([])

    // Password Reset State (dev only resets admin passwords)
    const [admins, setAdmins] = useState<UserRecord[]>([])
    const [selectedUserId, setSelectedUserId] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [resetLoading, setResetLoading] = useState(false)
    const [resetMsg, setResetMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    useEffect(() => {
        // Environment info
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
        setEnvInfo([
            { key: 'SUPABASE_URL', value: supabaseUrl ? 'Configurado' : 'No configurado' },
            { key: 'SUPABASE_ANON_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Configurado' : 'No configurado' },
            { key: 'Entorno', value: process.env.NODE_ENV || 'unknown' },
        ])

        const supabase = createClient()

        // Fetch table row counts
        const fetchTables = async () => {
            const results: TableInfo[] = []
            for (const table of DB_TABLES) {
                try {
                    const { count, error } = await supabase
                        .from(table)
                        .select('*', { count: 'exact', head: true })
                    results.push({
                        name: table,
                        count: error ? null : (count ?? 0),
                        error: error?.message,
                    })
                } catch (err: any) {
                    results.push({ name: table, count: null, error: err.message })
                }
            }
            setTables(results)
            setLoadingTables(false)
        }

        // Fetch users for password reset (via API with service role to bypass RLS)
        const fetchUsers = async () => {
            try {
                const res = await fetch('/api/dev/users')
                if (res.ok) {
                    const data = await res.json()
                    setAdmins(data.admins || [])
                }
            } catch (e) {
                console.warn('Error fetching users:', e)
            }
        }

        fetchTables()
        fetchUsers()
    }, [])

    const { logout } = useAuth()
    const handleLogout = () => logout()

    const DEV_SUCURSAL_ID = '1dc56deb-f568-421b-b8d1-94fce9acf64a'

    const navigateAsDevAdmin = (redirect: string) => {
        sessionStorage.setItem('barbercloud_session', JSON.stringify({
            role: 'admin',
            user: {
                sucursal_id: DEV_SUCURSAL_ID,
                nombre: 'Desarrollador',
                email: 'dev@barbercloud.com',
                rol: 'admin'
            }
        }))
        window.location.href = redirect
    }

    const handleResetPassword = async () => {
        if (!selectedUserId || !newPassword) {
            setResetMsg({ type: 'error', text: 'Selecciona un usuario e ingresa la nueva contraseña' })
            return
        }
        if (newPassword.length < 6) {
            setResetMsg({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres' })
            return
        }

        setResetLoading(true)
        setResetMsg(null)

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'usuarios_admin',
                    userId: selectedUserId,
                    newPassword
                })
            })

            const data = await res.json()

            if (res.ok && data.success) {
                setResetMsg({ type: 'success', text: 'Contraseña actualizada correctamente' })
                setNewPassword('')
                setSelectedUserId('')
            } else {
                setResetMsg({ type: 'error', text: data.error || 'Error al restablecer' })
            }
        } catch {
            setResetMsg({ type: 'error', text: 'Error de conexion al servidor' })
        } finally {
            setResetLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900/10 to-slate-900">
            {/* Header */}
            <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/30">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="font-bold text-white text-lg">BarberCloud <span className="text-emerald-400">Dev</span></h1>
                            <p className="text-xs text-slate-400">Panel de desarrollador</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all text-sm"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Cerrar sesión
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8 animate-fade-in">
                {/* Quick Links */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <Link
                        href="/dev/negocios"
                        className="glass-card p-5 flex items-center gap-4 hover:scale-[1.02] transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10 group border-emerald-500/30"
                    >
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Negocios (SaaS)</h3>
                            <p className="text-xs text-slate-400">Crear y gestionar clientes</p>
                        </div>
                    </Link>

                    <button
                        onClick={() => navigateAsDevAdmin('/admin')}
                        className="glass-card p-5 flex items-center gap-4 hover:scale-[1.02] transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10 group text-left"
                    >
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Panel Admin</h3>
                            <p className="text-xs text-slate-400">BarberCloud Principal (Dev)</p>
                        </div>
                    </button>

                    <button
                        onClick={() => navigateAsDevAdmin('/tablet')}
                        className="glass-card p-5 flex items-center gap-4 hover:scale-[1.02] transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 group text-left"
                    >
                        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Vista Tablet</h3>
                            <p className="text-xs text-slate-400">BarberCloud Principal (Dev)</p>
                        </div>
                    </button>

                    <Link
                        href="/api/auth/login"
                        target="_blank"
                        className="glass-card p-5 flex items-center gap-4 hover:scale-[1.02] transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10 group"
                    >
                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">API Login</h3>
                            <p className="text-xs text-slate-400">Endpoint test</p>
                        </div>
                    </Link>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Environment Status */}
                    <div className="glass-card p-6">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            Estado del Sistema
                        </h2>
                        <div className="space-y-3">
                            {envInfo.map((item) => (
                                <div key={item.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/50">
                                    <span className="text-sm text-slate-300 font-mono">{item.key}</span>
                                    <span className="text-sm">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Database Tables */}
                    <div className="glass-card p-6">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            </svg>
                            Tablas de Base de Datos
                        </h2>
                        {loadingTables ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="spinner" />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {tables.map((t) => (
                                    <div key={t.name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/50">
                                        <span className="text-sm text-slate-300 font-mono">{t.name}</span>
                                        {t.error ? (
                                            <span className="text-xs text-red-400 max-w-[200px] truncate" title={t.error}>{t.error}</span>
                                        ) : (
                                            <span className="text-sm font-bold text-emerald-400">{t.count} filas</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Password Reset Tool */}
                <div className="glass-card p-6">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        Restablecer Contraseña
                    </h2>

                    <p className="text-sm text-slate-400 mb-4">Solo administradores. Los barberos se gestionan desde el panel admin.</p>

                    {/* User Select */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-2">Seleccionar usuario</label>
                            <select
                                value={selectedUserId}
                                onChange={(e) => { setSelectedUserId(e.target.value); setResetMsg(null) }}
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
                            >
                                <option value="">-- Selecciona --</option>
                                {admins.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.nombre} — {u.email || u.usuario_tablet} ({u.sucursal_nombre})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm text-slate-400 mb-2">Nueva contraseña</label>
                            <input
                                type="text"
                                value={newPassword}
                                onChange={(e) => { setNewPassword(e.target.value); setResetMsg(null) }}
                                placeholder="Minimo 6 caracteres"
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500"
                            />
                        </div>

                        <button
                            onClick={handleResetPassword}
                            disabled={resetLoading || !selectedUserId || !newPassword}
                            className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-all text-sm"
                        >
                            {resetLoading ? 'Actualizando...' : 'Restablecer Contraseña'}
                        </button>

                        {resetMsg && (
                            <div className={`p-3 rounded-lg text-sm ${resetMsg.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                {resetMsg.text}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
