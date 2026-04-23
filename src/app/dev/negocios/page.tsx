'use client'

import { useState, useEffect } from 'react'
import { formatError } from '@/lib/supabase'
import Link from 'next/link'
import type { Sucursal } from '@/lib/types'

interface SucursalStats {
    barberos_activos: number
    barberos_total: number
    servicios_activos: number
    servicios_total: number
    citas_total: number
    ultima_cita: string | null
    admin_email: string | null
    admin_nombre: string | null
}

type SucursalConStats = Sucursal & { _stats: SucursalStats }

export default function GestorNegocios() {
    const [sucursales, setSucursales] = useState<SucursalConStats[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState({
        nombre: '',
        slug: '',
        plan: 'basico',
        telefono_whatsapp: '',
        adminEmail: '',
        adminPassword: '',
        // AI Agent Config
        agent_name: 'BarberBot',
        agent_personality: 'Friendly',
        agent_instance_name: '',
        agent_instance_name: '',
        agent_evolution_key: '',
        agent_enabled: true,  // Webhook Evo
        agent_active: true,   // IA Bot
        llm_provider: '', // default a global
        llm_model: '',
        // Tipo Prestador
        tipo_prestador: 'barbero',
        tipo_prestador_label: 'Barbero',
        // Recordatorios
        recordatorios_activos: false,
        minutos_antes_recordatorio: 15,
        minutos_tardanza_mensaje: 15
    })

    const [testConnLoading, setTestConnLoading] = useState(false)
    const [testConnResult, setTestConnResult] = useState<{success: boolean, msg: string} | null>(null)
    
    const [cardTests, setCardTests] = useState<Record<string, { loading: boolean, status: 'success' | 'error' | null, msg: string }>>({})
    const [appOrigin, setAppOrigin] = useState('')

    const checkAllConnections = async (list: SucursalConStats[]) => {
        list.forEach(async (s) => {
            if (!s.agent_instance_name || !s.agent_enabled) return
            
            setCardTests(prev => ({ ...prev, [s.id]: { loading: true, status: null, msg: '' } }))
            try {
                const res = await fetch('/api/dev/evolution/check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instanceName: s.agent_instance_name,
                        evolutionKey: s.agent_evolution_key
                    })
                })
                const data = await res.json()
                if (res.ok && data.success) {
                    setCardTests(prev => ({ ...prev, [s.id]: { loading: false, status: data.state === 'open' ? 'success' : 'error', msg: data.state } }))
                } else {
                    setCardTests(prev => ({ ...prev, [s.id]: { loading: false, status: 'error', msg: 'Sin conexión' } }))
                }
            } catch (err) {
                setCardTests(prev => ({ ...prev, [s.id]: { loading: false, status: 'error', msg: 'Error de red' } }))
            }
        })
    }

    const fetchSucursales = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/dev/negocios')
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setSucursales(data.sucursales || [])
            checkAllConnections(data.sucursales || [])
        } catch (err) {
            setError(formatError(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSucursales()
        if (typeof window !== 'undefined') {
            setAppOrigin(window.location.origin)
        }
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const isEditing = !!editingId
            const url = '/api/dev/negocios'
            const method = isEditing ? 'PATCH' : 'POST'

            const payload: any = {
                nombre: form.nombre,
                slug: form.slug,
                plan: form.plan,
                telefono_whatsapp: form.telefono_whatsapp,
                agent_name: form.agent_name,
                agent_personality: form.agent_personality,
                agent_instance_name: form.agent_instance_name,
                agent_evolution_key: form.agent_evolution_key,
                agent_enabled: form.agent_enabled,
                agent_active: form.agent_active,
                llm_provider: form.llm_provider || null,
                llm_model: form.llm_model || null,
                tipo_prestador: form.tipo_prestador,
                tipo_prestador_label: form.tipo_prestador_label,
                recordatorios_activos: form.recordatorios_activos,
                minutos_antes_recordatorio: form.minutos_antes_recordatorio,
                minutos_tardanza_mensaje: form.minutos_tardanza_mensaje
            }

            if (isEditing) {
                payload.id = editingId
            } else {
                payload.adminEmail = form.adminEmail
                payload.adminPassword = form.adminPassword
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || `Error al ${isEditing ? 'editar' : 'crear'} negocio`)
            }

            // Reset form
            setForm({ 
                nombre: '', 
                slug: '', 
                plan: 'basico', 
                telefono_whatsapp: '', 
                adminEmail: '', 
                adminPassword: '',
                agent_name: 'BarberBot',
                agent_personality: 'Friendly',
                agent_instance_name: '',
                agent_evolution_key: '',
                agent_enabled: true,
                agent_active: true,
                llm_provider: '',
                llm_model: '',
                tipo_prestador: 'barbero',
                tipo_prestador_label: 'Barbero',
                recordatorios_activos: false,
                minutos_antes_recordatorio: 15,
                minutos_tardanza_mensaje: 15
            })
            setIsCreating(false)
            setEditingId(null)
            setTestConnResult(null)
            fetchSucursales()
            alert(isEditing ? 'Configuración actualizada con éxito.' : 'Negocio y Administrador creados con éxito.')
        } catch (err) {
            alert('Error: ' + formatError(err))
        }
    }

    const startEditing = (s: SucursalConStats) => {
        setForm({
            nombre: s.nombre || '',
            slug: s.slug || '',
            plan: s.plan || 'basico',
            telefono_whatsapp: s.telefono_whatsapp || '',
            adminEmail: '', // No editable here
            adminPassword: '', // No editable here
            agent_name: s.agent_name || 'BarberBot',
            agent_personality: s.agent_personality || 'Friendly',
            agent_instance_name: s.agent_instance_name || '',
            agent_evolution_key: s.agent_evolution_key || '',
            agent_enabled: s.agent_enabled !== undefined ? s.agent_enabled : true,
            agent_active: s.agent_active !== undefined ? s.agent_active : true,
            llm_provider: s.llm_provider || '',
            llm_model: s.llm_model || '',
            tipo_prestador: s.tipo_prestador || 'barbero',
            tipo_prestador_label: s.tipo_prestador_label || 'Barbero',
            recordatorios_activos: s.recordatorios_activos || false,
            minutos_antes_recordatorio: s.minutos_antes_recordatorio || 15,
            minutos_tardanza_mensaje: s.minutos_tardanza_mensaje || 15
        })
        setEditingId(s.id)
        setIsCreating(true)
        setTestConnResult(null)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const toggleActivo = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch('/api/dev/negocios', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, activa: !currentStatus })
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error)
            }
            fetchSucursales()
        } catch (err) {
            alert('Error al actualizar estado: ' + formatError(err))
        }
    }

    const toggleField = async (id: string, field: string, currentValue: boolean) => {
        try {
            const res = await fetch('/api/dev/negocios', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, [field]: !currentValue })
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error)
            }
            fetchSucursales()
        } catch (err) {
            alert(`Error al actualizar estado: ` + formatError(err))
        }
    }

    const handleDelete = async (id: string, nombre: string) => {
        if (!window.confirm(`Estas seguro de eliminar "${nombre}"?\n\nSe eliminaran TODOS sus datos: barberos, servicios, citas, admins y costos.\n\nEsta accion no se puede deshacer.`)) {
            return
        }

        try {
            const res = await fetch(`/api/dev/negocios?id=${id}`, {
                method: 'DELETE'
            })
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.error)
            }
            fetchSucursales()
        } catch (err) {
            alert('Error al eliminar: ' + formatError(err))
        }
    }

    const handleTestConnection = async () => {
        if (!form.agent_instance_name) {
            setTestConnResult({ success: false, msg: 'Ingresa el nombre de la instancia' })
            return
        }

        setTestConnLoading(true)
        setTestConnResult(null)
        try {
            const res = await fetch('/api/dev/evolution/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceName: form.agent_instance_name,
                    evolutionKey: form.agent_evolution_key
                })
            })
            const data = await res.json()
            if (res.ok && data.success) {
                setTestConnResult({ 
                    success: true, 
                    msg: `¡Conexión exitosa! Estado: ${data.state} | Status: ${data.status}` 
                })
            } else {
                setTestConnResult({ success: false, msg: data.error || 'Error desconocido' })
            }
        } catch (err) {
            setTestConnResult({ success: false, msg: formatError(err) })
        } finally {
            setTestConnLoading(false)
        }
    }

    const testCardConnection = async (s: SucursalConStats) => {
        if (!s.agent_instance_name) {
            setCardTests(prev => ({ ...prev, [s.id]: { loading: false, status: 'error', msg: 'Sin instancia' } }))
            return
        }
        setCardTests(prev => ({ ...prev, [s.id]: { loading: true, status: null, msg: '' } }))
        try {
            const res = await fetch('/api/dev/evolution/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instanceName: s.agent_instance_name,
                    evolutionKey: s.agent_evolution_key
                })
            })
            const data = await res.json()
            if (res.ok && data.success) {
                setCardTests(prev => ({ ...prev, [s.id]: { loading: false, status: data.state === 'open' ? 'success' : 'error', msg: `${data.state}` } }))
            } else {
                setCardTests(prev => ({ ...prev, [s.id]: { loading: false, status: 'error', msg: data.error || 'Error EvoAPI' } }))
            }
        } catch (err) {
            setCardTests(prev => ({ ...prev, [s.id]: { loading: false, status: 'error', msg: 'Error de red' } }))
        }
    }

    // Auto-generate slug from name
    const handleNombreChange = (val: string) => {
        const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
        setForm(prev => ({ ...prev, nombre: val, slug }))
    }

    const isDev = (s: SucursalConStats) => s.slug === 'negocio-principal'

    const formatTimeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 60) return `hace ${mins}m`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `hace ${hours}h`
        const days = Math.floor(hours / 24)
        if (days < 30) return `hace ${days}d`
        return new Date(dateStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Hermosillo' })
    }

    if (loading && sucursales.length === 0) {
        return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><div className="spinner" /></div>
    }

    return (
        <div className="min-h-screen bg-slate-900">
            <header className="border-b border-slate-700/50 bg-slate-800/50 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dev" className="p-2 rounded-lg bg-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700 transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="font-bold text-white text-xl">Gestion de Negocios (SaaS)</h1>
                            <p className="text-sm text-slate-400">Total: {sucursales.length} negocios registrados</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsCreating(!isCreating)}
                        className="btn-primary py-2 px-4 shadow-emerald-500/20 shadow-lg"
                    >
                        + Nuevo Negocio
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                        {error}
                    </div>
                )}

                {isCreating && (
                    <div className="mb-8 p-6 rounded-2xl bg-slate-800 border border-slate-700 animate-fade-in glass-card">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-white">{editingId ? 'Editar Configuración del Negocio' : 'Registrar Nuevo Negocio'}</h2>
                            {editingId && <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-2 py-1 rounded">ID: {editingId}</span>}
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Nombre Comercial</label>
                                    <input
                                        required
                                        type="text"
                                        value={form.nombre}
                                        onChange={(e) => handleNombreChange(e.target.value)}
                                        className="input-field w-full bg-slate-900 border-slate-700"
                                        placeholder="Ej. Barberia Central"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Slug (Identificador URL)</label>
                                    <input
                                        required
                                        type="text"
                                        value={form.slug}
                                        onChange={(e) => setForm({ ...form, slug: e.target.value })}
                                        className="input-field w-full bg-slate-900 border-slate-700 font-mono text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Telefono WhatsApp</label>
                                    <input
                                        required
                                        type="text"
                                        value={form.telefono_whatsapp}
                                        onChange={(e) => setForm({ ...form, telefono_whatsapp: e.target.value })}
                                        className="input-field w-full bg-slate-900 border-slate-700"
                                        placeholder="+521..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">Plan de Suscripcion</label>
                                    <select
                                        value={form.plan}
                                        onChange={(e) => setForm({ ...form, plan: e.target.value })}
                                        className="input-field w-full bg-slate-900 border-slate-700"
                                    >
                                        <option value="basico">Basico</option>
                                        <option value="pro">Pro</option>
                                        <option value="premium">Premium</option>
                                    </select>
                                </div>
                            </div>

                            {!editingId && (
                                <div className="pt-6 border-t border-slate-700/50">
                                    <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4">Credenciales del Administrador</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">Correo Electronico</label>
                                            <input
                                                required
                                                type="email"
                                                value={form.adminEmail}
                                                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                                                className="input-field w-full bg-slate-900 border-slate-700"
                                                placeholder="admin@ejemplo.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">Contrasena Inicial</label>
                                            <input
                                                required
                                                type="text"
                                                value={form.adminPassword}
                                                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                                                className="input-field w-full bg-slate-900 border-slate-700"
                                                placeholder="Minimo 6 caracteres"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="pt-6 border-t border-slate-700/50">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider">Configuración Agente IA</h3>
                                    
                                    <div className="flex gap-6">
                                        <label className="flex items-center gap-2 cursor-pointer" title="Ignora todos los mensajes de esta instancia de Evolution API si se apaga">
                                            <span className="text-xs font-bold text-slate-300">Conexión Evolution</span>
                                            <div 
                                                onClick={() => setForm({ ...form, agent_enabled: !form.agent_enabled })}
                                                className={`w-10 h-5 rounded-full relative transition-colors shadow-inner ${form.agent_enabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
                                            >
                                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${form.agent_enabled ? 'right-1' : 'left-1'}`} />
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-2 cursor-pointer" title="Apaga el bot de IA, pero la instancia sigue conectada recibiendo mensajes (modo pausa manual general)">
                                            <span className="text-xs font-bold text-slate-300">Bot IA Activo</span>
                                            <div 
                                                onClick={() => setForm({ ...form, agent_active: !form.agent_active })}
                                                className={`w-10 h-5 rounded-full relative transition-colors shadow-inner ${form.agent_active ? 'bg-purple-500' : 'bg-slate-700'}`}
                                            >
                                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${form.agent_active ? 'right-1' : 'left-1'}`} />
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {/* ===== TIPO PRESTADOR - Campo Destacado ===== */}
                                <div className="mb-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-amber-400 text-lg">👤</span>
                                        <div>
                                            <p className="text-sm font-bold text-amber-300">Tipo de Prestador de Servicio</p>
                                            <p className="text-xs text-slate-400">Determina cómo el agente nombra a sus proveedores en las conversaciones</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">Tipo (predefinido)</label>
                                            <select
                                                value={form.tipo_prestador}
                                                onChange={(e) => {
                                                    const presets: Record<string, string> = {
                                                        'barbero': 'Barbero',
                                                        'estilista': 'Estilista',
                                                        'pedicurista': 'Pedicurista',
                                                        'manicurista': 'Manicurista',
                                                        'terapeuta': 'Terapeuta',
                                                        'entrenador': 'Entrenador',
                                                        'medico': 'Médico',
                                                        'custom': form.tipo_prestador_label || ''
                                                    }
                                                    setForm({
                                                        ...form,
                                                        tipo_prestador: e.target.value,
                                                        tipo_prestador_label: presets[e.target.value] || form.tipo_prestador_label
                                                    })
                                                }}
                                                className="input-field w-full bg-slate-900 border-slate-700 text-sm"
                                            >
                                                <option value="barbero">✂️ Barbero/a (Barberías)</option>
                                                <option value="estilista">💇 Estilista (Salones)</option>
                                                <option value="pedicurista">💅 Pedicurista (Manicure/Pedicure)</option>
                                                <option value="manicurista">💅 Manicurista</option>
                                                <option value="terapeuta">🧘 Terapeuta (Spas / Masajes)</option>
                                                <option value="entrenador">💪 Entrenador/a (Gyms)</option>
                                                <option value="medico">👨‍⚕️ Médico/a (Consultorios)</option>
                                                <option value="custom">✏️ Personalizado</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1.5">
                                                Etiqueta qué verá el cliente
                                                {form.tipo_prestador !== 'custom' && <span className="ml-1 text-amber-400 text-[10px]">(auto)</span>}
                                            </label>
                                            <input
                                                type="text"
                                                value={form.tipo_prestador_label}
                                                onChange={(e) => setForm({ ...form, tipo_prestador_label: e.target.value })}
                                                className="input-field w-full bg-slate-900 border-slate-700 text-sm"
                                                placeholder="Ej. Estilista, Entrenadora..."
                                                readOnly={form.tipo_prestador !== 'custom'}
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1">
                                                El agente dirá: "Tu <strong className="text-amber-300">{form.tipo_prestador_label}</strong> disponible es..."
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Nombre del Agente</label>
                                        <input
                                            type="text"
                                            value={form.agent_name}
                                            onChange={(e) => setForm({ ...form, agent_name: e.target.value })}
                                            className="input-field w-full bg-slate-900 border-slate-700"
                                            placeholder="Ej. BarberBot"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Personalidad</label>
                                        <select
                                            value={form.agent_personality}
                                            onChange={(e) => setForm({ ...form, agent_personality: e.target.value })}
                                            className="input-field w-full bg-slate-900 border-slate-700"
                                        >
                                            <option value="Friendly">Amigable / Cercano</option>
                                            <option value="Professional">Profesional / Serio</option>
                                            <option value="Funny">Divertido / Informal</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Instancia Evolution API</label>
                                        <input
                                            type="text"
                                            value={form.agent_instance_name}
                                            onChange={(e) => setForm({ ...form, agent_instance_name: e.target.value })}
                                            className="input-field w-full bg-slate-900 border-slate-700"
                                            placeholder="Nombre de la instancia"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Evolution API Key (Opcional)</label>
                                        <input
                                            type="text"
                                            value={form.agent_evolution_key}
                                            onChange={(e) => setForm({ ...form, agent_evolution_key: e.target.value })}
                                            className="input-field w-full bg-slate-900 border-slate-700"
                                            placeholder="Usar key global si está vacío"
                                        />
                                    </div>
                                    <div className="flex flex-col justify-end pb-1 lg:col-span-1 md:col-span-2">
                                        <button
                                            type="button"
                                            onClick={handleTestConnection}
                                            disabled={testConnLoading}
                                            className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 text-purple-400 border border-purple-500/30 rounded-lg text-xs font-bold transition-colors w-full shadow-sm"
                                        >
                                            {testConnLoading ? 'Probando...' : 'Probar Conexión Evolution API'}
                                        </button>
                                        {testConnResult && (
                                            <div className={`mt-2 p-2 rounded text-[10px] ${testConnResult.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                {testConnResult.msg}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Proveedor Custom (Dejar vacío=Global)</label>
                                        <select
                                            value={form.llm_provider}
                                            onChange={(e) => setForm({ ...form, llm_provider: e.target.value })}
                                            className="input-field w-full bg-slate-900 border-slate-700"
                                        >
                                            <option value="">-- Ignorar (Usar Configuración Global) --</option>
                                            <option value="openai">OpenAI</option>
                                            <option value="anthropic">Anthropic</option>
                                            <option value="groq">Groq</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Modelo del Agente</label>
                                        <select
                                            value={form.llm_model}
                                            onChange={(e) => setForm({ ...form, llm_model: e.target.value })}
                                            className="input-field w-full bg-slate-900 border-slate-700"
                                        >
                                            <option value="">-- Usar modelo global por defecto --</option>
                                            {(!form.llm_provider || form.llm_provider === 'openai') && (
                                                <>
                                                    <option value="gpt-4o">GPT-4o</option>
                                                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                                                    <option value="gpt-4.1">GPT-4.1</option>
                                                    <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                                                    <option value="gpt-4.1-nano">GPT-4.1 Nano</option>
                                                    <option value="o4-mini">o4-mini (Reasoning)</option>
                                                    <option value="o3">o3 (Reasoning)</option>
                                                    <option value="o3-mini">o3-mini (Reasoning)</option>
                                                </>
                                            )}
                                            {form.llm_provider === 'anthropic' && (
                                                <>
                                                    <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                                                    <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                                                    <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku (Rápido)</option>
                                                    <option value="claude-3-opus-20240229">Claude 3 Opus (Premium)</option>
                                                </>
                                            )}
                                            {form.llm_provider === 'groq' && (
                                                <>
                                                    <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                                                    <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                                                    <option value="gemma2-9b-it">Gemma 2 9B</option>
                                                    <option value="compound-beta">Compound Beta (Tool Use)</option>
                                                    <option value="meta-llama/llama-4-maverick-17b-128e-instruct">Llama 4 Maverick 17B</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* ===== SECCIÓN RECORDATORIOS ===== */}
                            <div className="pt-6 border-t border-slate-700/50">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">Recordatorios Automáticos</h3>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <span className="text-xs text-slate-400">{form.recordatorios_activos ? 'Activados' : 'Desactivados'}</span>
                                        <div 
                                            onClick={() => setForm({ ...form, recordatorios_activos: !form.recordatorios_activos })}
                                            className={`w-10 h-5 rounded-full relative transition-colors ${form.recordatorios_activos ? 'bg-blue-500' : 'bg-slate-700'}`}
                                        >
                                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${form.recordatorios_activos ? 'right-1' : 'left-1'}`} />
                                        </div>
                                    </label>
                                </div>

                                <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity ${form.recordatorios_activos ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                    <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Minutos antes (Recordatorio)</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                value={form.minutos_antes_recordatorio}
                                                onChange={(e) => setForm({ ...form, minutos_antes_recordatorio: parseInt(e.target.value) || 0 })}
                                                className="input-field w-24 bg-slate-900 border-slate-700 text-center"
                                                min="1"
                                                max="1440"
                                            />
                                            <span className="text-sm text-slate-400">minutos antes de la hora pactada</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-2 italic">
                                            El cliente recibirá un mensaje de confirmación en este tiempo.
                                        </p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10">
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Minutos después (Mensaje Retraso)</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                value={form.minutos_tardanza_mensaje}
                                                onChange={(e) => setForm({ ...form, minutos_tardanza_mensaje: parseInt(e.target.value) || 0 })}
                                                className="input-field w-24 bg-slate-900 border-slate-700 text-center"
                                                min="1"
                                                max="120"
                                            />
                                            <span className="text-sm text-slate-400">minutos después de la hora</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-2 italic">
                                            Se enviará si el cliente no ha sido marcado como "presente".
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCreating(false)
                                        setEditingId(null)
                                    }}
                                    className="px-6 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition"
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-primary px-8 py-2 shadow-emerald-500/20 shadow-lg">
                                    {editingId ? 'Guardar Cambios' : 'Finalizar y Crear Negocio'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sucursales.map((s) => (
                        <div key={s.id} className={`glass-card p-6 transition-colors ${isDev(s) ? 'border-purple-500/30 hover:border-purple-500/50' : 'border-slate-700/50 hover:border-emerald-500/30'}`}>
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-white">{s.nombre}</h3>
                                        {isDev(s) && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 uppercase">Dev</span>
                                        )}
                                    </div>
                                    {s.slug && <p className="text-xs text-slate-400 font-mono mt-1">/{s.slug}</p>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${s.activa ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {s.activa ? 'ACTIVO' : 'INACTIVO'}
                                    </span>
                                    <button 
                                        onClick={() => startEditing(s)}
                                        className="p-1 px-2 rounded bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-600 transition text-[10px] font-bold"
                                    >
                                        EDITAR
                                    </button>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-2 mb-4">
                                <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                                    <p className="text-lg font-bold text-white">{s._stats.barberos_activos}</p>
                                    <p className="text-[10px] text-slate-500 uppercase">Barberos</p>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                                    <p className="text-lg font-bold text-white">{s._stats.servicios_activos}</p>
                                    <p className="text-[10px] text-slate-500 uppercase">Servicios</p>
                                </div>
                                <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                                    <p className="text-lg font-bold text-white">{s._stats.citas_total}</p>
                                    <p className="text-[10px] text-slate-500 uppercase">Citas</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <Link
                                    href={`/dev/negocios/${s.id}/ia-monitor`}
                                    className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 rounded-lg p-2 text-center transition-colors shadow-sm shadow-purple-900/10"
                                >
                                    <p className="text-[10px] uppercase font-bold tracking-wider mb-1 flex justify-center items-center gap-1">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                                        Monitor AI
                                    </p>
                                    <p className="text-xs">Ver Métricas</p>
                                </Link>
                                <Link
                                    href={`/dev/negocios/${s.id}/ia-tester`}
                                    className="bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/20 rounded-lg p-2 text-center transition-colors shadow-sm shadow-fuchsia-900/10"
                                >
                                    <p className="text-[10px] uppercase font-bold tracking-wider mb-1 flex justify-center items-center gap-1">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                                        Chat Tester
                                    </p>
                                    <p className="text-xs">Probar Agente</p>
                                </Link>
                            </div>

                            <div className="space-y-2 mb-4 text-sm text-slate-300">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500">Bot IA:</span>
                                    <button 
                                        onClick={() => toggleField(s.id, 'agent_active', s.agent_active)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all active:scale-95 hover:opacity-80 border ${s.agent_active ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-slate-700/50 text-slate-400 border-slate-600/50'}`}
                                        title="Clic para pausar o activar el Agente de IA"
                                    >
                                        {s.agent_active ? 'ONLINE' : 'OFFLINE'}
                                    </button>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Plan:</span>
                                    <span className="capitalize font-medium text-emerald-300">{s.plan}</span>
                                </div>
                                {s.telefono_whatsapp && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">WhatsApp:</span>
                                        <span className="font-mono text-xs">{s.telefono_whatsapp}</span>
                                    </div>
                                )}
                                {s.direccion && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Direccion:</span>
                                        <span className="text-right max-w-[200px] truncate">{s.direccion}</span>
                                    </div>
                                )}
                                {s._stats.admin_email && (
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Admin:</span>
                                        <span className="text-xs text-amber-300 truncate max-w-[200px]">{s._stats.admin_email}</span>
                                    </div>
                                )}
                                
                                {/* Unificado Webhook e Instancia Evo */}
                                <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-700/50 bg-slate-900/30 -mx-6 px-6 pb-2">
                                    <div className="flex flex-col">
                                        <span className="text-slate-500 text-xs mb-1">
                                            Instancia Evo: <span className="text-slate-300 font-mono">{s.agent_instance_name || 'No asignada'}</span>
                                        </span>
                                        
                                        <div 
                                            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity" 
                                            onClick={() => toggleField(s.id, 'agent_enabled', s.agent_enabled)}
                                            title="Clic para habilitar o deshabilitar la recepción del Webhook"
                                        >
                                            {cardTests[s.id]?.loading ? (
                                                <div className="w-2.5 h-2.5 rounded-full border border-t-transparent border-slate-400 animate-spin" />
                                            ) : !s.agent_enabled ? (
                                                <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                                            ) : cardTests[s.id]?.status === 'success' ? (
                                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                                            ) : (
                                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                                            )}
                                            
                                            <span className={`text-[10px] font-bold ${!s.agent_enabled ? 'text-slate-500' : cardTests[s.id]?.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {!s.agent_enabled ? 'WEBHOOK APAGADO' : cardTests[s.id]?.status === 'success' ? 'RECIBIENDO MENSAJES' : 'SIN CONEXIÓN EVOLUTION'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {s.agent_instance_name && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); testCardConnection(s); }}
                                            disabled={cardTests[s.id]?.loading}
                                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700 shadow-sm"
                                            title="Actualizar estado de conexión"
                                        >
                                            <svg className={`w-3.5 h-3.5 ${cardTests[s.id]?.loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        </button>
                                    )}
                                </div>
                                
                                <div className="flex justify-between pt-2">
                                    <span className="text-slate-500 text-xs">Ultima cita:</span>
                                    <span className={s._stats.ultima_cita ? 'text-slate-300' : 'text-slate-600'}>
                                        {s._stats.ultima_cita ? formatTimeAgo(s._stats.ultima_cita) : 'Sin actividad'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Creado:</span>
                                    <span>{new Date(s.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Hermosillo' })}</span>
                                </div>
                                <div className="flex flex-col mt-3">
                                    <span className="text-slate-500 text-xs mb-1">ID:</span>
                                    <code className="text-[10px] bg-slate-900 px-2 py-1 rounded text-slate-400 break-all border border-slate-800">
                                        {s.id}
                                    </code>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-700/50 flex gap-2">
                                <button
                                    onClick={() => toggleActivo(s.id, s.activa)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        s.activa
                                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                    }`}
                                >
                                    {s.activa ? 'Desactivar' : 'Activar'}
                                </button>
                                {!isDev(s) && (
                                    <button
                                        onClick={() => handleDelete(s.id, s.nombre)}
                                        className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20 shadow-lg shadow-red-500/5"
                                        title="Eliminar Negocio"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}

                    {sucursales.length === 0 && !loading && (
                        <div className="col-span-full text-center py-12 text-slate-400">
                            No hay negocios registrados. Crea uno arriba.
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}
