'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient, formatError } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Servicio } from '@/lib/types'

/**
 * Página para administrar el catálogo de Servicios.
 * Permite listar, agregar, editar, eliminar y activar/desactivar servicios.
 */
export default function ServiciosPage() {
    const { sucursalId } = useAuth()
    const [servicios, setServicios] = useState<Servicio[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingServicio, setEditingServicio] = useState<Servicio | null>(null)

    const supabase = createClient()

    /**
     * Recupera la lista de servicios ordenados por precio ascendente.
     */
    const cargarServicios = useCallback(async () => {
        if (!sucursalId) {
            setLoading(false)
            return
        }
        try {
            const { data, error } = await supabase
                .from('servicios')
                .select('*')
                .eq('sucursal_id', sucursalId)
                .order('precio', { ascending: true })

            if (error) {
                console.warn('Error loading services:', formatError(error))
                setServicios(getDemoServices())
            } else {
                setServicios(data || [])
            }
        } catch (err) {
            console.warn('Supabase not configured:', formatError(err))
            setServicios(getDemoServices())
        } finally {
            setLoading(false)
        }
    }, [supabase, sucursalId])

    useEffect(() => {
        cargarServicios()
    }, [cargarServicios])

    /**
     * Elimina un servicio por su ID tras confirmación del usuario.
     */
    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este servicio?')) return

        try {
            const res = await fetch(`/api/servicios?id=${id}`, { method: 'DELETE' })
            const result = await res.json()
            if (!res.ok || !result.success) throw new Error(result.error || 'Error al eliminar')
            cargarServicios()
        } catch (err) {
            console.warn('Error deleting:', formatError(err))
            alert('Error al eliminar')
        }
    }

    /**
     * Abre el modal de edición para un servicio existente.
     */
    const handleEdit = (servicio: Servicio) => {
        setEditingServicio(servicio)
        setShowModal(true)
    }

    /**
     * Abre el modal para crear un nuevo servicio en blanco.
     */
    const handleNew = () => {
        setEditingServicio(null)
        setShowModal(true)
    }

    /**
     * Alterna el estado 'activo' de un servicio directamente desde la lista.
     */
    const toggleActivo = async (servicio: Servicio) => {
        try {
            const res = await fetch('/api/servicios', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: servicio.id, activo: !servicio.activo })
            })
            const result = await res.json()
            if (!res.ok || !result.success) throw new Error(result.error)
            cargarServicios()
        } catch (err) {
            console.warn('Error toggling:', formatError(err))
        }
    }

    return (

        <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">Servicios</h1>
                    <p className="text-muted-foreground mt-1">Administra el catálogo de servicios y precios</p>
                </div>
                <button
                    onClick={() => {
                        setEditingServicio(null)
                        setShowModal(true)
                    }}
                    className="btn-primary flex items-center justify-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nuevo Servicio
                </button>
            </div>

            {/* Services Grid */}
            {loading ? (
                <div className="glass-card p-12 flex items-center justify-center">
                    <div className="spinner w-8 h-8" />
                </div>
            ) : servicios.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <svg className="w-12 h-12 text-muted-foreground mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                    </svg>
                    <p className="text-muted-foreground">No hay servicios configurados</p>
                    <button onClick={handleNew} className="btn-primary mt-4">
                        Crear primer servicio
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {servicios.map((servicio) => (
                        <div
                            key={servicio.id}
                            className={`
                glass-card p-6 transition-all duration-300 hover:scale-[1.02]
                ${!servicio.activo ? 'opacity-60' : ''}
              `}
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                                    </svg>
                                </div>
                                <button
                                    onClick={() => toggleActivo(servicio)}
                                    className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${servicio.activo ? 'bg-purple-600' : 'bg-slate-600'}
                  `}
                                >
                                    <span className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${servicio.activo ? 'translate-x-6' : 'translate-x-1'}
                  `} />
                                </button>
                            </div>

                            {/* Content */}
                            <h3 className="text-xl font-bold text-foreground mb-2">{servicio.nombre}</h3>

                            <div className="flex items-center gap-4 text-muted-foreground text-sm mb-4">
                                <div className="flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {servicio.duracion_minutos} min
                                </div>
                            </div>

                            {/* Price */}
                            <div className="flex items-baseline gap-1 mb-6">
                                <span className="text-3xl font-bold text-foreground">
                                    ${servicio.precio.toLocaleString('es-MX')}
                                </span>
                                <span className="text-muted-foreground">MXN</span>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEdit(servicio)}
                                    className="flex-1 py-2 px-4 rounded-lg bg-surface-hover hover:bg-slate-600 transition-colors text-sm font-medium text-foreground flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleDelete(servicio.id)}
                                    className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors"
                                    title="Eliminar"
                                >
                                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <ServicioModal
                    servicio={editingServicio}
                    sucursalId={sucursalId}
                    onClose={() => setShowModal(false)}
                    onSave={() => {
                        setShowModal(false)
                        cargarServicios()
                    }}
                />
            )}
        </>

    )
}

// Demo data
function getDemoServices(): Servicio[] {
    return [
        {
            id: '1',
            sucursal_id: '1',
            nombre: 'Corte Clásico',
            duracion_minutos: 40,
            precio: 250,
            activo: true,
            created_at: new Date().toISOString()
        },
        {
            id: '2',
            sucursal_id: '1',
            nombre: 'Barba',
            duracion_minutos: 30,
            precio: 150,
            activo: true,
            created_at: new Date().toISOString()
        },
        {
            id: '3',
            sucursal_id: '1',
            nombre: 'Combo Completo',
            duracion_minutos: 60,
            precio: 350,
            activo: true,
            created_at: new Date().toISOString()
        },
        {
            id: '4',
            sucursal_id: '1',
            nombre: 'Corte + Diseño',
            duracion_minutos: 50,
            precio: 300,
            activo: true,
            created_at: new Date().toISOString()
        },
        {
            id: '5',
            sucursal_id: '1',
            nombre: 'Corte Infantil',
            duracion_minutos: 30,
            precio: 180,
            activo: false,
            created_at: new Date().toISOString()
        }
    ]
}

/**
 * Componente modal para crear o editar un servicio específico.
 */
function ServicioModal({
    servicio,
    sucursalId,
    onClose,
    onSave
}: {
    servicio: Servicio | null
    sucursalId: string | null
    onClose: () => void
    onSave: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        nombre: servicio?.nombre || '',
        duracion_minutos: servicio?.duracion_minutos?.toString() || '30',
        precio: servicio?.precio?.toString() || '',
        costo_directo: servicio?.costo_directo?.toString() || '0',
        activo: servicio?.activo ?? true
    })

    const supabase = createClient()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            if (!sucursalId && !servicio) {
                throw new Error('No se encontró una sucursal activa')
            }

            const data = {
                nombre: formData.nombre,
                duracion_minutos: parseInt(formData.duracion_minutos),
                precio: parseFloat(formData.precio),
                costo_directo: parseFloat(formData.costo_directo || '0'),
                activo: formData.activo
            }

            if (servicio) {
                const res = await fetch('/api/servicios', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: servicio.id, ...data })
                })
                const result = await res.json()
                if (!res.ok || !result.success) throw new Error(result.error || 'Error al actualizar')
            } else {
                const res = await fetch('/api/servicios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...data, sucursal_id: sucursalId })
                })
                const result = await res.json()
                if (!res.ok || !result.success) throw new Error(result.error || 'Error al crear')
            }

            onSave()
        } catch (err) {
            console.warn('Error saving:', formatError(err))
            onSave()
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card w-full max-w-md animate-slide-in border border-border">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-foreground">
                        {servicio ? 'Editar Servicio' : 'Nuevo Servicio'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-hover transition-colors">
                        <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-muted mb-2">Nombre del Servicio</label>
                        <input
                            type="text"
                            value={formData.nombre}
                            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                            className="input-field"
                            placeholder="Corte Clásico"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-muted mb-2">Duración (minutos)</label>
                            <select
                                value={formData.duracion_minutos}
                                onChange={(e) => setFormData({ ...formData, duracion_minutos: e.target.value })}
                                className="input-field"
                            >
                                <option value="15">15 min</option>
                                <option value="30">30 min</option>
                                <option value="40">40 min</option>
                                <option value="45">45 min</option>
                                <option value="60">60 min</option>
                                <option value="90">90 min</option>
                                <option value="120">120 min</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted mb-2">Precio (MXN)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.precio}
                                    onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                                    className="input-field pl-8"
                                    placeholder="250.00"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted mb-2">Costo Directo (MXN)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={formData.costo_directo}
                                    onChange={(e) => setFormData({ ...formData, costo_directo: e.target.value })}
                                    className="input-field pl-8"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="activo"
                            checked={formData.activo}
                            onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                            className="w-4 h-4 rounded bg-surface-hover border-slate-600 text-purple-600 focus:ring-purple-500"
                        />
                        <label htmlFor="activo" className="text-sm text-muted">
                            Servicio disponible
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={onClose} className="btn-secondary">
                            Cancelar
                        </button>
                        <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
                            {loading && <div className="spinner w-4 h-4" />}
                            {servicio ? 'Guardar Cambios' : 'Crear Servicio'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
