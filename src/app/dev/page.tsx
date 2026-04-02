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
    const [health, setHealth] = useState<any>(null)
    const [loadingHealth, setLoadingHealth] = useState(true)
    const [envInfo, setEnvInfo] = useState<{ key: string; value: string }[]>([])

    // Password Reset State (dev only resets admin passwords)
    const [admins, setAdmins] = useState<UserRecord[]>([])
    const [selectedUserId, setSelectedUserId] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [resetLoading, setResetLoading] = useState(false)
    const [resetMsg, setResetMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    
    // Global AI Config State
    const [aiConfig, setAiConfig] = useState({
        evolution_api_url: '',
        evolution_api_key: '',
        openai_api_key: '',
        anthropic_api_key: '',
        groq_api_key: '',
        default_provider: 'openai',
        openai_model: 'gpt-4o-mini',
        anthropic_model: 'claude-3-5-sonnet-20240620',
        groq_model: 'llama-3.1-70b-versatile'
    })
    const [aiLoading, setAiLoading] = useState(false)
    const [aiMsg, setAiMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    useEffect(() => {
        // Environment info
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
        setEnvInfo([
            { key: 'SUPABASE_URL', value: supabaseUrl ? 'Configurado' : 'No configurado' },
            { key: 'SUPABASE_ANON_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Configurado' : 'No configurado' },
            { key: 'Entorno', value: process.env.NODE_ENV || 'unknown' },
        ])

        const supabase = createClient()

        // Fetch system health
        const fetchHealth = async () => {
            try {
                const res = await fetch('/api/admin/health')
                const data = await res.json()
                setHealth(data)
            } catch (err) {
                console.error('Error fetching health:', err)
            } finally {
                setLoadingHealth(false)
            }
        }

        fetchHealth()
        const healthInterval = setInterval(fetchHealth, 30000)

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

        const fetchAiConfig = async () => {
            try {
                const res = await fetch('/api/dev/config-ia')
                if (res.ok) {
                    const data = await res.json()
                    if (data.config) {
                        setAiConfig(data.config)
                    }
                }
            } catch (e) {
                console.warn('Error fetching AI config:', e)
            }
        }

        fetchTables()
        fetchUsers()
        fetchAiConfig()
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

    const handleSaveAiConfig = async () => {
        setAiLoading(true)
        setAiMsg(null)
        try {
            const res = await fetch('/api/dev/config-ia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(aiConfig)
            })
            if (res.ok) {
                setAiMsg({ type: 'success', text: 'Configuración de IA guardada' })
            } else {
                setAiMsg({ type: 'error', text: 'Error al guardar la configuración' })
            }
        } catch {
            setAiMsg({ type: 'error', text: 'Error de red' })
        } finally {
            setAiLoading(false)
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
                            <h1 className="font-bold text-white text-lg">BotDynamic <span className="text-emerald-400">Dev</span></h1>
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
                    <div className="glass-card p-6 border-t-4 border-t-emerald-500">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Estado de Conectividad
                        </h2>
                        {loadingHealth ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="spinner w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { name: 'Redis', data: health?.redis },
                                    { name: 'Postgres', data: health?.postgres },
                                    { name: 'Supabase', data: health?.supabase },
                                    { name: 'Evolution', data: health?.evolution },
                                ].map((service) => (
                                    <div key={service.name} className="p-3 rounded-xl bg-slate-900/50 border border-slate-700/50 flex flex-col gap-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{service.name}</span>
                                            <div className={`w-2 h-2 rounded-full ${service.data?.status === 'up' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                                        </div>
                                        <div className="flex items-end justify-between mt-1">
                                            <span className={`text-sm font-semibold ${service.data?.status === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {service.data?.status === 'up' ? 'ONLINE' : 'OFFLINE'}
                                            </span>
                                            {service.data?.status === 'up' && (
                                                <span className="text-[10px] text-slate-500 font-mono">{service.data?.latency}ms</span>
                                            )}
                                        </div>
                                        {service.data?.error && (
                                            <div className="text-[9px] text-red-500/70 truncate mt-1 leading-tight" title={service.data.error}>
                                                {service.data.error}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                
                                <div className="col-span-2 mt-2 pt-2 border-t border-slate-700/30 flex justify-between items-center text-[10px] text-slate-500">
                                    <span>Última actualización:</span>
                                    <span>{new Date(health?.timestamp).toLocaleTimeString()}</span>
                                </div>
                            </div>
                        )}
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

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

                    {/* AI Global Configuration */}
                    <div className="glass-card p-6">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Gestor de Proveedores IA (Global)
                        </h2>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1.5 uppercase font-medium">Evolution API URL</label>
                                    <input
                                        type="text"
                                        value={aiConfig.evolution_api_url || ''}
                                        onChange={(e) => setAiConfig({ ...aiConfig, evolution_api_url: e.target.value })}
                                        className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1.5 uppercase font-medium">Evolution API Key</label>
                                    <input
                                        type="password"
                                        value={aiConfig.evolution_api_key || ''}
                                        onChange={(e) => setAiConfig({ ...aiConfig, evolution_api_key: e.target.value })}
                                        className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
                                    />
                                </div>
                            </div>
                            
                            <hr className="border-slate-700 my-2"/>

                            <div>
                                <label className="block text-xs text-slate-400 mb-1.5 uppercase font-medium">Proveedor de Motor por Defecto</label>
                                <select
                                    value={aiConfig.default_provider || 'openai'}
                                    onChange={(e) => setAiConfig({ ...aiConfig, default_provider: e.target.value as any })}
                                    className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
                                >
                                    <option value="openai">OpenAI</option>
                                    <option value="anthropic">Anthropic (Claude)</option>
                                    <option value="groq">Groq (Llama/Mixtral)</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1.5 uppercase font-medium">OpenAI Key</label>
                                    <input
                                        type="password"
                                        value={aiConfig.openai_api_key || ''}
                                        onChange={(e) => setAiConfig({ ...aiConfig, openai_api_key: e.target.value })}
                                        className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
                                    />
                                    <select
                                        value={aiConfig.openai_model || 'gpt-4o-mini'}
                                        onChange={(e) => setAiConfig({ ...aiConfig, openai_model: e.target.value })}
                                        className="w-full bg-slate-800/50 border border-slate-700 text-xs text-slate-300 rounded-lg px-3 py-1.5 mt-1 focus:border-purple-500 outline-none transition-colors"
                                    >
                                        <option value="gpt-4o">GPT-4o</option>
                                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                                        <option value="gpt-4.1">GPT-4.1</option>
                                        <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                                        <option value="gpt-4.1-nano">GPT-4.1 Nano</option>
                                        <option value="o4-mini">o4-mini (Reasoning)</option>
                                        <option value="o3">o3 (Reasoning)</option>
                                        <option value="o3-mini">o3-mini (Reasoning)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1.5 uppercase font-medium">Anthropic Key</label>
                                    <input
                                        type="password"
                                        value={aiConfig.anthropic_api_key || ''}
                                        onChange={(e) => setAiConfig({ ...aiConfig, anthropic_api_key: e.target.value })}
                                        className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
                                    />
                                    <select
                                        value={aiConfig.anthropic_model || 'claude-sonnet-4-20250514'}
                                        onChange={(e) => setAiConfig({ ...aiConfig, anthropic_model: e.target.value })}
                                        className="w-full bg-slate-800/50 border border-slate-700 text-xs text-slate-300 rounded-lg px-3 py-1.5 mt-1 focus:border-purple-500 outline-none transition-colors"
                                    >
                                        <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                                        <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                                        <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku (Rápido)</option>
                                        <option value="claude-3-opus-20240229">Claude 3 Opus (Premium)</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs text-slate-400 mb-1.5 uppercase font-medium">Groq Key</label>
                                    <input
                                        type="password"
                                        value={aiConfig.groq_api_key || ''}
                                        onChange={(e) => setAiConfig({ ...aiConfig, groq_api_key: e.target.value })}
                                        className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
                                    />
                                    <select
                                        value={aiConfig.groq_model || 'llama-3.3-70b-versatile'}
                                        onChange={(e) => setAiConfig({ ...aiConfig, groq_model: e.target.value })}
                                        className="w-full bg-slate-800/50 border border-slate-700 text-xs text-slate-300 rounded-lg px-3 py-1.5 mt-1 focus:border-purple-500 outline-none transition-colors"
                                    >
                                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                                        <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                                        <option value="gemma2-9b-it">Gemma 2 9B</option>
                                        <option value="compound-beta">Compound Beta (Tool Use)</option>
                                        <option value="meta-llama/llama-4-maverick-17b-128e-instruct">Llama 4 Maverick 17B</option>
                                    </select>
                                </div>
                            </div>
                            
                            <button
                                onClick={handleSaveAiConfig}
                                disabled={aiLoading}
                                className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-white font-medium rounded-lg transition-all text-sm mt-2 shadow-lg shadow-purple-900/20"
                            >
                                {aiLoading ? 'Guardando...' : 'Guardar Configuración Global IA'}
                            </button>

                            {aiMsg && (
                                <div className={`p-2.5 rounded-lg text-xs font-medium ${aiMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                    {aiMsg.text}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
