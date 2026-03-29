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
    const [form, setForm] = useState({
        nombre: '',
        slug: '',
        plan: 'basico',
        telefono_whatsapp: '',
        adminEmail: '',
        adminPassword: ''
    })

    const fetchSucursales = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/dev/negocios')
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setSucursales(data.sucursales || [])
        } catch (err) {
            setError(formatError(err))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSucursales()
    }, [])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const res = await fetch('/api/dev/negocios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: form.nombre,
                    slug: form.slug,
                    plan: form.plan,
                    telefono_whatsapp: form.telefono_whatsapp,
                    adminEmail: form.adminEmail,
                    adminPassword: form.adminPassword
                })
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Error al crear negocio')
            }

            setForm({ nombre: '', slug: '', plan: 'basico', telefono_whatsapp: '', adminEmail: '', adminPassword: '' })
            setIsCreating(false)
            fetchSucursales()
            alert('Negocio y Administrador creados con éxito.')
        } catch (err) {
            alert('Error en el registro: ' + formatError(err))
        }
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
                        <h2 className="text-lg font-bold text-white mb-6">Registrar Nuevo Negocio</h2>
                        <form onSubmit={handleCreate} className="space-y-6">
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

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsCreating(false)}
                                    className="px-6 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition"
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-primary px-8 py-2 shadow-emerald-500/20 shadow-lg">
                                    Finalizar y Crear Negocio
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
                                <span className={`px-2 py-1 rounded-md text-xs font-bold ${s.activa ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {s.activa ? 'ACTIVO' : 'INACTIVO'}
                                </span>
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

                            <div className="space-y-2 mb-4 text-sm text-slate-300">
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
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Ultima cita:</span>
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
