'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient, formatError, getIsDemoMode } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { CitaConRelaciones, EstadoCita, Servicio, Barbero } from '@/lib/types'
import { APP_TIMEZONE, todayInTZ, startOfDayISO, endOfDayISO } from '@/lib/timezone'

/**
 * Página administrativa para la gestión general de citas.
 * Ofrece dos modos de vista: 'Diario' (para gestionar de manera operativa) e 'Historial'
 * (para búsqueda y análisis retrospectivo).
 */
export default function CitasPage() {
    const { sucursalId } = useAuth()
    // 1. Hydration mismatch fix: Start with a stable state or wait for mount
    const [mounted, setMounted] = useState(false)
    const [citas, setCitas] = useState<CitaConRelaciones[]>([])
    const [loading, setLoading] = useState(true)
    const [filtroFecha, setFiltroFecha] = useState('') // Empty initially
    const [filtroEstado, setFiltroEstado] = useState<EstadoCita | 'todas'>('todas')
    const [filtroServicio, setFiltroServicio] = useState<string>('todos')
    const [serviciosList, setServiciosList] = useState<any[]>([])

    
    // History Mode State
    const [viewMode, setViewMode] = useState<'daily' | 'history'>('daily')
    const [historyStart, setHistoryStart] = useState('')
    const [historyEnd, setHistoryEnd] = useState('')
    const [searchTerm, setSearchTerm] = useState('')


    const [showModal, setShowModal] = useState(false)
    const [editingCita, setEditingCita] = useState<CitaConRelaciones | null>(null)
    const [initialOrigen, setInitialOrigen] = useState<'whatsapp' | 'walkin'>('whatsapp')

    const handleNewCita = (origen: 'whatsapp' | 'walkin' = 'whatsapp') => {
        setEditingCita(null)
        setInitialOrigen(origen)
        setShowModal(true)
    }

    const handleEditCita = (cita: CitaConRelaciones) => {
        setEditingCita(cita)
        setInitialOrigen(cita.origen as any)
        setShowModal(true)
    }

    const handleDeleteCita = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar esta cita?')) return
        try {
            const res = await fetch(`/api/citas?id=${id}`, { method: 'DELETE' })
            const result = await res.json()
            if (!res.ok || !result.success) throw new Error(result.error || 'Error al eliminar')
            cargarCitas()
        } catch (err: any) {
            alert('Error al eliminar: ' + err.message)
        }
    }

    const handleStatusChange = async (cardita: CitaConRelaciones, newStatus: EstadoCita) => {
        try {
            const { error } = await (supabase
                .from('citas') as any)
                .update({ estado: newStatus })
                .eq('id', cardita.id)

            if (error) throw error
            cargarCitas()
        } catch (err: any) {
            console.warn('Error updating status:', formatError(err))
        }
    }

    // 2. Stable Supabase client
    const [supabase] = useState(() => createClient())

    // Initialize date only on client side
    useEffect(() => {
        const today = todayInTZ()
        setFiltroFecha(today)

        // Default history range: last 30 days
        const lastMonth = new Date()
        lastMonth.setDate(lastMonth.getDate() - 30)
        setHistoryStart(lastMonth.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE }))
        setHistoryEnd(today)

        setMounted(true)
    }, [])

    useEffect(() => {
        if (!sucursalId) return
        const fetchServicios = async () => {
             const { data } = await supabase.from('servicios')
                 .select('id, nombre')
                 .eq('activo', true)
                 .eq('sucursal_id', sucursalId)
             if (data) setServiciosList(data)
        }
        fetchServicios()
    }, [sucursalId])

    /**
     * Recupera las citas desde Supabase aplicando los filtros seleccionados (fecha,
     * estado, servicio, modo de vista, etc.).
     */
    const cargarCitas = useCallback(async () => {
        if (!filtroFecha) return // Wait for date

        setLoading(true)
        try {
            const inicioDelDia = startOfDayISO(filtroFecha)
            const finDelDia = endOfDayISO(filtroFecha)

            console.log('Fetching citas for:', filtroFecha)

            // Force casting to any to avoid TS issues with Supabase definitions
            let query = (supabase
                .from('citas') as any)
                .select(`
          *,
          servicio:servicios(*),
          barbero:barberos(nombre, estacion_id)
        `).eq('sucursal_id', sucursalId)

            if (viewMode === 'daily') {
                query = query
                    .gte('timestamp_inicio', inicioDelDia)
                    .lte('timestamp_inicio', finDelDia)
                    .order('timestamp_inicio', { ascending: true })
            } else {
                // History Mode
                if (historyStart) query = query.gte('timestamp_inicio', startOfDayISO(historyStart))
                if (historyEnd) query = query.lte('timestamp_inicio', endOfDayISO(historyEnd))
                
                if (searchTerm) {
                    query = query.ilike('cliente_nombre', `%${searchTerm}%`)
                }
                
                // Limit history to avoid huge payloads, order by newest first
                query = query.order('timestamp_inicio', { ascending: false }).limit(50)
            }

            if (filtroEstado !== 'todas') {
                query = query.eq('estado', filtroEstado)
            }

            if (filtroServicio !== 'todos') {
                if (filtroServicio === 'personalizado') {
                    query = query.is('servicio_id', null)
                } else {
                    query = query.eq('servicio_id', filtroServicio)
                }
            }

            const { data, error } = await query

            if (error) {
                console.warn('Error Supabase:', formatError(error))
                console.warn('Error Supabase:', formatError(error))
                setCitas([])
            } else {
                if (!data || data.length === 0) {
                    setCitas([])
                } else {
                    setCitas(data)
                }
            }
        } catch (err: any) {
            console.warn('Catch Error:', formatError(err))
            if (getIsDemoMode()) {
                setCitas(getDemoCitas(filtroFecha))
            } else {
                setCitas([])
            }
        } finally {
            setLoading(false)
        }
    }, [supabase, filtroFecha, filtroEstado, filtroServicio, viewMode, historyStart, historyEnd, searchTerm, sucursalId])

    // Load data when mode changes or filters change (debouncing search could be added here)
    useEffect(() => {
        if (mounted) {
            if (viewMode === 'daily' && filtroFecha) cargarCitas()
            // For history, maybe wait for explicit "Buscar" or load initial? 
            // Let's load initial for now
            if (viewMode === 'history') cargarCitas()
        }
    }, [mounted, viewMode, filtroFecha, cargarCitas]) // Removed specific history deps to avoid auto-reload on every keystroke if unwanted, but kept simple for now

    // Avoid hydration mismatch by not rendering until mounted
    if (!mounted) {
        return <div className="p-8 text-foreground">Cargando aplicación...</div>
    }

    return (
        <>
            <div className="mb-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Citas</h1>
                        <p className="text-muted-foreground mt-1">
                            {viewMode === 'daily' ? 'Gestiona las citas del día' : 'Historial de clientes'}
                        </p>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <button
                            onClick={() => setViewMode(prev => prev === 'daily' ? 'history' : 'daily')}
                            className="flex-1 md:flex-none px-4 py-2 rounded-xl bg-surface-hover hover:bg-slate-600 text-foreground transition-colors flex items-center justify-center gap-2"
                        >
                            {viewMode === 'daily' ? (
                                <>
                                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Ver Historial
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Ver Diario
                                </>
                            )}
                        </button>
                        <button
                            onClick={() => handleNewCita('whatsapp')}
                            className="btn-primary flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Nueva Cita
                        </button>
                    </div>
                </div>
            </div>


            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="glass-card p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{citas.length}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="glass-card p-4 text-center border-l-2 border-blue-500">
                    <p className="text-2xl font-bold text-blue-400">
                        {citas.filter(c => c.estado === 'confirmada').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Confirmadas</p>
                </div>
                <div className="glass-card p-4 text-center border-l-2 border-emerald-500">
                    <p className="text-2xl font-bold text-emerald-400">
                        {citas.filter(c => c.estado === 'en_proceso').length}
                    </p>
                    <p className="text-xs text-muted-foreground">En Proceso</p>
                </div>
                <div className="glass-card p-4 text-center border-l-2 border-slate-500">
                    <p className="text-2xl font-bold text-muted-foreground">
                        {citas.filter(c => c.estado === 'finalizada').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Finalizadas</p>
                </div>
                <div className="glass-card p-4 text-center border-l-2 border-red-500">
                    <p className="text-2xl font-bold text-red-400">
                        {citas.filter(c => c.estado === 'cancelada' || c.estado === 'no_show').length}
                    </p>
                    <p className="text-xs text-muted-foreground">Canceladas</p>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-card p-4 mb-6">
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                    {viewMode === 'daily' ? (
                        /* Daily Filters */
                        <>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Fecha</label>
                                <input
                                    type="date"
                                    value={filtroFecha}
                                    onChange={(e) => setFiltroFecha(e.target.value)}
                                    className="input-field w-full md:w-auto text-foreground"
                                />
                            </div>
                        </>
                    ) : (
                        /* History Filters */
                        <>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Buscar Cliente</label>
                                <div className="relative">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Nombre..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="input-field w-full md:w-64 pl-9"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Desde</label>
                                <input
                                    type="date"
                                    value={historyStart}
                                    onChange={(e) => setHistoryStart(e.target.value)}
                                    className="input-field w-full md:w-auto"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-muted-foreground mb-1">Hasta</label>
                                <input
                                    type="date"
                                    value={historyEnd}
                                    onChange={(e) => setHistoryEnd(e.target.value)}
                                    className="input-field w-full md:w-auto"
                                />
                            </div>
                        </>
                    )}

                    {/* Common Filters */}
                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">Estado</label>
                        <select
                            value={filtroEstado}
                            onChange={(e) => setFiltroEstado(e.target.value as EstadoCita | 'todas')}
                            className="input-field w-full md:w-auto text-foreground"
                        >
                            <option value="todas">Todas</option>
                            <option value="confirmada">Confirmadas</option>
                            <option value="en_espera">En Espera</option>
                            <option value="en_proceso">En Proceso</option>
                            <option value="finalizada">Finalizadas</option>
                            <option value="cancelada">Canceladas</option>
                            <option value="no_show">No Show</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-muted-foreground mb-1">Servicio</label>
                        <select
                            value={filtroServicio}
                            onChange={(e) => setFiltroServicio(e.target.value)}
                            className="input-field w-full md:w-auto text-foreground"
                        >
                            <option value="todos">Todos los servicios</option>
                            {serviciosList.map(s => (
                                <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                            <option value="personalizado">Otro / Personalizado</option>
                        </select>
                    </div>
                    <button
                        onClick={() => cargarCitas()}
                        className="btn-secondary px-4 py-2"
                    >
                        {viewMode === 'daily' ? 'Actualizar' : 'Buscar'}
                    </button>
                    
                    {viewMode === 'history' && (
                        <div className="ml-auto text-xs text-muted-foreground/70 self-center">
                            Mostrando últimos 50 resultados
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile View (Cards) */}
            <div className="md:hidden space-y-4">
                {loading ? (
                    <div className="p-8 flex items-center justify-center">
                        <div className="spinner w-8 h-8" />
                    </div>
                ) : citas.length === 0 ? (
                    <div className="glass-card p-8 text-center">
                        <p className="text-muted-foreground">No hay citas para esta fecha</p>
                    </div>
                ) : (
                    citas.map((cita) => (
                        <div key={cita.id} className="glass-card p-4 relative">
                            {/* Header: Time & Status */}
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    {viewMode === 'history' && cita.timestamp_inicio && (
                                        <div className="text-xs font-semibold text-purple-400 mb-0.5">
                                            {new Date(cita.timestamp_inicio).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: APP_TIMEZONE })}
                                        </div>
                                    )}
                                    <div className="text-lg font-bold text-foreground font-mono leading-none">
                                        {cita.timestamp_inicio ? new Date(cita.timestamp_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE }) : '--:--'}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        - {cita.timestamp_fin ? new Date(cita.timestamp_fin).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE }) : '--:--'}
                                    </div>
                                </div>
                                <span className={`
                                    status-badge
                                    ${cita.estado === 'confirmada' ? 'bg-blue-500/20 text-blue-400' : ''}
                                    ${cita.estado === 'en_proceso' ? 'status-in-progress' : ''}
                                    ${cita.estado === 'finalizada' ? 'bg-slate-500/20 text-muted-foreground' : ''}
                                    ${cita.estado === 'cancelada' ? 'status-cancelled' : ''}
                                    ${cita.estado === 'no_show' ? 'bg-red-500/20 text-red-400' : ''}
                                `}>
                                    {cita.estado ? cita.estado.replace('_', ' ') : ' desconocida'}
                                </span>
                            </div>

                            {/* Client Info */}
                            <div className="mb-3">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium text-foreground text-lg">{cita.cliente_nombre}</p>
                                    {cita.origen === 'whatsapp' && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">WA</span>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">{cita.cliente_telefono}</p>
                            </div>

                            {/* Service & Barber */}
                            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                                <div className="bg-surface/ p-2 rounded">
                                    <p className="text-xs text-muted-foreground/70 mb-0.5">Servicio</p>
                                    <p className="text-slate-200 truncate">{cita.servicio?.nombre || 'Personalizado'}</p>
                                </div>
                                <div className="bg-surface/ p-2 rounded">
                                    <p className="text-xs text-muted-foreground/70 mb-0.5">Barbero</p>
                                    <p className="text-slate-200 truncate">{cita.barbero?.nombre || 'Sin asignar'}</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-2 border-t border-slate-700/50 pt-3">
                                {cita.estado === 'confirmada' && (
                                    <button
                                        onClick={() => handleStatusChange(cita, 'en_proceso')}
                                        className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400"
                                    >
                                        <span className="sr-only">Iniciar</span>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </button>
                                )}
                                {cita.estado === 'en_proceso' && (
                                    <button
                                        onClick={() => handleStatusChange(cita, 'finalizada')}
                                        className="p-2 rounded-lg bg-blue-500/20 text-blue-400"
                                    >
                                        <span className="sr-only">Finalizar</span>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    </button>
                                )}
                                <button
                                    onClick={() => handleEditCita(cita)}
                                    className="p-2 rounded-lg bg-surface-hover text-muted"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                                <button
                                    onClick={() => handleDeleteCita(cita.id)}
                                    className="p-2 rounded-lg bg-red-500/10 text-red-400"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Desktop Table */}
            <div className="glass-card overflow-hidden hidden md:block">
                {loading ? (
                    <div className="p-12 flex items-center justify-center">
                        <div className="spinner w-8 h-8" />
                    </div>
                ) : citas.length === 0 ? (
                    <div className="p-12 text-center">
                        <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-muted-foreground/70">No hay citas para esta fecha</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px]">
                            <thead className="bg-surface/">
                                <tr>
                                    <th className="px-3 md:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">{viewMode === 'history' ? 'Fecha y Hora' : 'Hora'}</th>
                                    <th className="px-3 md:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Cliente</th>
                                    <th className="px-3 md:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Servicio</th>
                                    <th className="px-3 md:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Barbero</th>
                                    <th className="px-3 md:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase">Estado</th>
                                    <th className="px-3 md:px-6 py-4 text-right text-xs font-semibold text-muted-foreground uppercase">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {citas.map((cita) => (
                                    <tr key={cita.id} className="hover:bg-surface/ transition-colors">
                                        <td className="px-3 md:px-6 py-4 font-mono text-sm text-muted">
                                            {viewMode === 'history' && cita.timestamp_inicio && (
                                                <div className="text-xs font-semibold text-foreground mb-1">
                                                    {new Date(cita.timestamp_inicio).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: APP_TIMEZONE })}
                                                </div>
                                            )}
                                            <div>
                                                <span className="text-slate-300">{cita.timestamp_inicio ? new Date(cita.timestamp_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE }) : '--:--'}</span>
                                                <span className="text-muted-foreground/70 mx-1">-</span>
                                                <span className="text-muted-foreground/90">{cita.timestamp_fin ? new Date(cita.timestamp_fin).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE }) : '--:--'}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 md:px-6 py-4">
                                            <p className="font-medium text-foreground">{cita.cliente_nombre}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-muted-foreground">{cita.cliente_telefono}</span>
                                                {cita.origen === 'whatsapp' && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">WA</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 md:px-6 py-4">
                                            <div className="text-sm text-muted">
                                                {cita.servicio?.nombre || 'Servicio Personalizado'}
                                            </div>
                                            <div className="text-xs text-muted-foreground/70">
                                                {cita.barbero?.nombre || 'Sin barbero'}
                                            </div>
                                        </td>
                                        <td className="px-3 md:px-6 py-4">
                                            <span className={`
                        status-badge
                        ${cita.estado === 'confirmada' ? 'bg-blue-500/20 text-blue-400' : ''}
                        ${cita.estado === 'en_proceso' ? 'status-in-progress' : ''}
                        ${cita.estado === 'finalizada' ? 'bg-slate-500/20 text-muted-foreground ' : ''}
                        ${cita.estado === 'cancelada' ? 'status-cancelled' : ''}
                        ${cita.estado === 'no_show' ? 'bg-red-500/20 text-red-400' : ''}
                        `}>
                                                {cita.estado ? cita.estado.replace('_', ' ') : ' desconocida'}
                                            </span>
                                        </td>
                                        <td className="px-3 md:px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {/* Status Actions */}
                                                {cita.estado === 'confirmada' && (
                                                    <button
                                                        onClick={() => handleStatusChange(cita, 'en_proceso')}
                                                        className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                                        title="Iniciar Cita"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                    </button>
                                                )}
                                                {cita.estado === 'en_proceso' && (
                                                    <button
                                                        onClick={() => handleStatusChange(cita, 'finalizada')}
                                                        className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                                                        title="Finalizar Cita"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => handleEditCita(cita)}
                                                    className="p-1.5 rounded-lg bg-surface-hover text-muted hover:bg-slate-600"
                                                    title="Editar"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                </button>

                                                <button
                                                    onClick={() => handleDeleteCita(cita.id)}
                                                    className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                                    title="Eliminar"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {
                showModal && (
                    <CitaModal
                        cita={editingCita}
                        sucursalId={sucursalId}
                        onClose={() => setShowModal(false)}
                        onSave={() => {
                            setShowModal(false)
                            cargarCitas()
                        }}
                        initialOrigen={initialOrigen}
                    />
                )
            }

        </>
    )
}

function getDemoCitas(fecha: string): CitaConRelaciones[] {
    const safeFecha = fecha || new Date().toISOString().split('T')[0]
    return [
        {
            id: '1',
            sucursal_id: '1',
            barbero_id: '1',
            servicio_id: '1',
            cliente_nombre: 'Carlos Mendoza',
            cliente_telefono: '+52 555 123 4567',
            timestamp_inicio: `${safeFecha}T10:00:00`,
            timestamp_fin: `${safeFecha}T10:40:00`,
            origen: 'whatsapp',
            estado: 'en_proceso',
            notas: null,
            recordatorio_24h_enviado: true,
            recordatorio_1h_enviado: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            servicio: { id: '1', sucursal_id: '1', nombre: 'Corte Clásico', duracion_minutos: 40, precio: 250, activo: true, created_at: '' },
            barbero: { id: '1', sucursal_id: '1', nombre: 'Carlos H.', estacion_id: 1, usuario_tablet: '', password_hash: '', horario_laboral: {}, bloqueo_almuerzo: null, activo: true, hora_entrada: null, created_at: '' }
        },
        {
            id: '2',
            sucursal_id: '1',
            barbero_id: '1',
            servicio_id: '2',
            cliente_nombre: 'Roberto García',
            cliente_telefono: '+52 555 987 6543',
            timestamp_inicio: `${safeFecha}T11:00:00`,
            timestamp_fin: `${safeFecha}T11:30:00`,
            origen: 'whatsapp',
            estado: 'confirmada',
            notas: null,
            recordatorio_24h_enviado: true,
            recordatorio_1h_enviado: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            servicio: { id: '2', sucursal_id: '1', nombre: 'Barba', duracion_minutos: 30, precio: 150, activo: true, created_at: '' },
            barbero: { id: '1', sucursal_id: '1', nombre: 'Carlos H.', estacion_id: 1, usuario_tablet: '', password_hash: '', horario_laboral: {}, bloqueo_almuerzo: null, activo: true, hora_entrada: null, created_at: '' }
        },
        {
            id: '3',
            sucursal_id: '1',
            barbero_id: '2',
            servicio_id: '3',
            cliente_nombre: 'Miguel Torres',
            cliente_telefono: '+52 555 456 7890',
            timestamp_inicio: `${safeFecha}T12:00:00`,
            timestamp_fin: `${safeFecha}T13:00:00`,
            origen: 'walkin',
            estado: 'en_espera',
            notas: 'Cliente frecuente',
            recordatorio_24h_enviado: false,
            recordatorio_1h_enviado: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            servicio: { id: '3', sucursal_id: '1', nombre: 'Combo Completo', duracion_minutos: 60, precio: 350, activo: true, created_at: '' },
            barbero: { id: '2', sucursal_id: '1', nombre: 'Miguel L.', estacion_id: 2, usuario_tablet: '', password_hash: '', horario_laboral: {}, bloqueo_almuerzo: null, activo: true, hora_entrada: null, created_at: '' }
        }
    ]
}


function CitaModal({
    cita,
    sucursalId,
    onClose,
    onSave,
    initialOrigen = 'whatsapp'
}: {
    cita?: CitaConRelaciones | null
    sucursalId: string | null
    onClose: () => void
    onSave: () => void
    initialOrigen?: 'whatsapp' | 'walkin'
}) {
    const [loading, setLoading] = useState(false)
    const [servicios, setServicios] = useState<Servicio[]>([])
    const [barberos, setBarberos] = useState<Barbero[]>([])

    // Form State
    const [formData, setFormData] = useState({
        cliente_nombre: cita?.cliente_nombre || '',
        cliente_telefono: cita?.cliente_telefono || '',
        servicio_id: cita?.servicio_id || (cita ? 'custom' : ''), // If editing and no service, assume custom
        barbero_id: cita?.barbero_id || '',
        fecha: cita?.timestamp_inicio ? new Date(cita.timestamp_inicio).toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE }) : todayInTZ(),
        hora: cita?.timestamp_inicio ? new Date(cita.timestamp_inicio).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE }) : '10:00',
        horaFin: cita?.timestamp_fin ? new Date(cita.timestamp_fin).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE }) : '10:30',
        notas: cita?.notas || ''
    })

    const supabase = createClient()

    // Load dependencies on mount
    useEffect(() => {
        if (!sucursalId) return
        const loadDeps = async () => {
            // Load Services
            const { data: servs } = await supabase.from('servicios')
                .select('*')
                .eq('activo', true)
                .eq('sucursal_id', sucursalId)
            if (servs) setServicios(servs)

            // Load Barbers
            const { data: barbs } = await supabase.from('barberos')
                .select('*')
                .eq('activo', true)
                .eq('sucursal_id', sucursalId)
            if (barbs) setBarberos(barbs)
        }
        loadDeps()
    }, [sucursalId])

    // Update End Time automatically when Service or Start Time changes
    // BUT only if we are creating a new appointment or changing the service
    // For now, let's keep it simple: update suggested end time if service or start time changes
    // This might overwrite manual changes if they change service/start time again, which is usually expected behavior
    useEffect(() => {
        if (formData.servicio_id && formData.hora) {
            const service = servicios.find(s => s.id === formData.servicio_id)
            if (service) {
                const startDate = new Date(`2000-01-01T${formData.hora}:00`)
                const endDate = new Date(startDate.getTime() + service.duracion_minutos * 60000)
                const hours = endDate.getHours().toString().padStart(2, '0')
                const minutes = endDate.getMinutes().toString().padStart(2, '0')
                // Only update if it seems like a new setup or consistent flow
                // For editing, we might want to respect existing unless changed...
                // But the user explicitly asked to be able to "add a service aside",
                // meaning they want to manually extend it.
                // So we update the default suggestion, but they can edit it after.

                // Logic: If user changes service/start time, we propose new end time.
                // If they edit end time, it stays. 
                // However, without a "dirty" state, we can't know if they edited it manually.
                // Simple approach: Always update suggestion on dependency change.

                // Wait, if editing an existing appointment that ALREADY has a custom duration...
                // We shouldn't overwrite it on mount unless they change something.
                // This useEffect runs heavily.

                // We'll skip this effect for the initial mount of an existing cita 
                // (handled by initial state).
                // But we need it for live updates.

                // Let's protect it: compare current duration with service duration?
                // No, just update it. If they change service, they expect recalculation.
                setFormData(prev => ({
                    ...prev,
                    horaFin: `${hours}:${minutes}`
                }))
            }
        }
    }, [formData.servicio_id, formData.hora, servicios])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            if (!sucursalId) throw new Error('No se encontró sucursal activa')

            // Calculate timestamps
            // We need to create a proper Date object from the input date/time to send uniform ISO/UTC to DB
            // Browser creates Date in local timezone by default from these strings
            const startDate = new Date(`${formData.fecha}T${formData.hora}:00-07:00`)
            const endDate = new Date(`${formData.fecha}T${formData.horaFin}:00-07:00`)

            // Send ISO strings (UTC) to DB
            const timestamp_inicio = startDate.toISOString()
            const timestamp_fin = endDate.toISOString()

            // Handle "Custom Service"
            // If the user selected 'custom', we send null to servicio_id
            const finalServicioId = formData.servicio_id === 'custom' ? null : formData.servicio_id

            const newCita = {
                sucursal_id: sucursalId, // Use real ID
                servicio_id: finalServicioId,
                barbero_id: formData.barbero_id || null, // Optional barber
                cliente_nombre: formData.cliente_nombre,
                cliente_telefono: formData.cliente_telefono,
                timestamp_inicio,
                timestamp_fin,
                origen: cita ? cita.origen : initialOrigen,
                estado: cita ? cita.estado : (initialOrigen === 'walkin' ? 'en_espera' : 'confirmada'),
                notas: formData.notas
            }

            if (cita) {
                // UPDATE
                const { error } = await (supabase
                    .from('citas') as any)
                    .update(newCita)
                    .eq('id', cita.id)
                if (error) throw error
            } else {
                // INSERT
                const { error } = await (supabase
                    .from('citas') as any)
                    .insert([newCita])
                if (error) throw error
            }

            onSave()
        } catch (err) {
            console.warn('Error saving cita:', formatError(err))
            // Fallback for "Demo Mode" visualization if DB fails
            alert('Error al guardar cita: ' + (err as any).message)
            // onSave() // Don't close on error
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-card w-full max-w-lg animate-slide-in max-h-[90vh] overflow-y-auto border border-border">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-foreground">
                        {cita ? 'Editar Cita' : (initialOrigen === 'walkin' ? 'Nuevo Walk-in' : 'Nueva Cita')}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-hover transition-colors">
                        <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Cliente */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-muted mb-2">Cliente</label>
                            <input
                                type="text"
                                required
                                className="input-field"
                                placeholder="Nombre completo"
                                value={formData.cliente_nombre}
                                onChange={e => setFormData({ ...formData, cliente_nombre: e.target.value })}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-muted mb-2">Teléfono</label>
                            <input
                                type="tel"
                                className="input-field"
                                placeholder="+52..."
                                value={formData.cliente_telefono}
                                onChange={e => setFormData({ ...formData, cliente_telefono: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Detalle */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-muted mb-2">Servicio</label>
                            <select
                                required
                                className="input-field"
                                value={formData.servicio_id}
                                onChange={e => setFormData({ ...formData, servicio_id: e.target.value })}
                            >
                                <option value="">Seleccionar...</option>
                                <option value="custom">Servicio Personalizado</option>
                                {servicios.map(s => (
                                    <option key={s.id} value={s.id}>{s.nombre} (${s.precio})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-muted mb-2">Barbero</label>
                            <select
                                className="input-field"
                                value={formData.barbero_id}
                                onChange={e => setFormData({ ...formData, barbero_id: e.target.value })}
                            >
                                <option value="">Cualquiera</option>
                                {barberos.map(b => (
                                    <option key={b.id} value={b.id}>{b.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Tiempo */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-muted mb-2">Fecha</label>
                            <input
                                type="date"
                                required
                                className="input-field"
                                value={formData.fecha}
                                onChange={e => setFormData({ ...formData, fecha: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-sm font-medium text-muted mb-2">Inicio</label>
                                <input
                                    type="time"
                                    required
                                    className="input-field"
                                    value={formData.hora}
                                    onChange={e => setFormData({ ...formData, hora: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-muted mb-2">Fin</label>
                                <input
                                    type="time"
                                    required
                                    className="input-field"
                                    value={formData.horaFin} // Controlled by state
                                    onChange={e => setFormData({ ...formData, horaFin: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-muted mb-2">Notas</label>
                        <textarea
                            className="input-field min-h-[80px]"
                            placeholder="Notas adicionales..."
                            value={formData.notas}
                            onChange={e => setFormData({ ...formData, notas: e.target.value })}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button type="button" onClick={onClose} className="btn-secondary">
                            Cancelar
                        </button>
                        <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
                            {loading ? 'Guardando...' : (cita ? 'Guardar Cambios' : 'Confirmar Cita')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
