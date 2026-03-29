'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient, formatError } from '@/lib/supabase'
import { KPICard } from '@/components/KPICard'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { APP_TIMEZONE, startOfDayISO, endOfDayISO, todayInTZ } from '@/lib/timezone'
import type { KPIs } from '@/lib/types'

/**
 * Página principal del Dashboard de Administración (Admin).
 * Muestra KPIs (Citas Hoy, Ingresos, etc.), citas recientes y el estado actual de los barberos.
 */
export default function AdminDashboard() {
    const { sucursalId, logout } = useAuth()
    const [kpis, setKpis] = useState<KPIs>({
        citasHoy: 0,
        completadas: 0,
        ingresos: 0,
        noShows: 0,
        tendencias: {
            citasHoy: 0,
            completadas: 0,
            ingresos: 0,
            noShows: 0
        }
    })
    const [recentCitas, setRecentCitas] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [currentTime, setCurrentTime] = useState(new Date())

    const supabase = createClient()

    const [barberStatuses, setBarberStatuses] = useState<{
        id: string
        nombre: string
        estacion: number
        estado: 'ocupado' | 'disponible' | 'descanso'
        cliente: string | null
    }[]>([])

    /**
     * Carga y procesa las métricas principales (KPIs) comparando el día de hoy
     * con el mismo día de la semana pasada, calculando también el estado de los barberos.
     */
    const cargarKPIs = useCallback(async () => {
        if (!sucursalId) return // Wait until auth provides the ID
        
        const hoyStr = todayInTZ()
        const inicioDelDia = startOfDayISO(hoyStr)
        const finDelDia = endOfDayISO(hoyStr)

        const prevDate = new Date(`${hoyStr}T12:00:00-07:00`)
        prevDate.setDate(prevDate.getDate() - 7)
        const prevStr = prevDate.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
        const prevInicioDelDia = startOfDayISO(prevStr)
        const prevFinDelDia = endOfDayISO(prevStr)

        try {
            // 1. Fetch Citas Today & Last Week, isolated by sucursalId
            const [citasHoyRes, citasPrevRes, barberosRes] = await Promise.all([
                (supabase.from('citas') as any).select('*, servicio:servicios(nombre, precio)')
                    .eq('sucursal_id', sucursalId)
                    .gte('timestamp_inicio', inicioDelDia)
                    .lte('timestamp_inicio', finDelDia),
                (supabase.from('citas') as any).select('*, servicio:servicios(nombre, precio)')
                    .eq('sucursal_id', sucursalId)
                    .gte('timestamp_inicio', prevInicioDelDia)
                    .lte('timestamp_inicio', prevFinDelDia),
                supabase.from('barberos').select('*')
                    .eq('sucursal_id', sucursalId)
                    .eq('activo', true)
                    .order('estacion_id')
            ])

            if (citasHoyRes.error) throw citasHoyRes.error
            if (citasPrevRes.error) throw citasPrevRes.error
            if (barberosRes.error) throw barberosRes.error

            const citasHoy = citasHoyRes.data || []
            const citasPrev = citasPrevRes.data || []
            const barberos = barberosRes.data || []

            // 3. Process FAQs/Stats TODAY
            const completadas = citasHoy.filter((c: any) => c.estado === 'finalizada') || []
            const noShows = citasHoy.filter((c: any) => c.estado === 'no_show').length || 0
            const ingresos = completadas.reduce((sum: number, c: any) => sum + parseFloat(c.servicio?.precio || 0), 0)
            const totalCitasHoy = citasHoy.length

            // 3b. Process FAQs/Stats LAST WEEK
            const prevCompletadas = citasPrev.filter((c: any) => c.estado === 'finalizada') || []
            const prevNoShows = citasPrev.filter((c: any) => c.estado === 'no_show').length || 0
            const prevIngresos = prevCompletadas.reduce((sum: number, c: any) => sum + parseFloat(c.servicio?.precio || 0), 0)
            const prevTotalCitasHoy = citasPrev.length

            setKpis({
                citasHoy: totalCitasHoy,
                completadas: completadas.length,
                ingresos,
                noShows,
                tendencias: {
                    citasHoy: prevTotalCitasHoy > 0 ? ((totalCitasHoy - prevTotalCitasHoy) / prevTotalCitasHoy) * 100 : (totalCitasHoy > 0 ? 100 : 0),
                    completadas: prevCompletadas.length > 0 ? ((completadas.length - prevCompletadas.length) / prevCompletadas.length) * 100 : (completadas.length > 0 ? 100 : 0),
                    ingresos: prevIngresos > 0 ? ((ingresos - prevIngresos) / prevIngresos) * 100 : (ingresos > 0 ? 100 : 0),
                    noShows: prevNoShows > 0 ? ((noShows - prevNoShows) / prevNoShows) * 100 : (noShows > 0 ? 100 : 0)
                }
            })

            // Sort for Recent Citas (Chronological)
            const sortedCitas = [...(citasHoy || [])].sort((a: any, b: any) => 
                new Date(a.timestamp_inicio).getTime() - new Date(b.timestamp_inicio).getTime()
            )
            setRecentCitas(sortedCitas.slice(0, 5))

            // 4. Calculate Barber Status
            if (barberos) {
                const statuses = barberos.map((b: any) => {
                    // Find active appointment: must be 'en_proceso' OR (confirmed and within current time window)
                    // For simplicity, we prioritize 'en_proceso' status explicitly set by barber
                    const activeCita = citasHoy?.find((c: any) =>
                        c.barbero_id === b.id && c.estado === 'en_proceso'
                    )

                    // TODO: Check 'bloqueos' table for 'descanso'

                    return {
                        id: b.id,
                        nombre: b.nombre.split(' ')[0], // First name only
                        estacion: b.estacion_id,
                        estado: activeCita ? 'ocupado' : 'disponible',
                        cliente: activeCita ? activeCita.cliente_nombre : null
                    }
                })
                setBarberStatuses(statuses as any)
            }

        } catch (err) {
            console.warn('Error loading dashboard data:', formatError(err))
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        cargarKPIs()
        const interval = setInterval(cargarKPIs, 30000)
        return () => clearInterval(interval)
    }, [cargarKPIs])

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(interval)
    }, [])

    return (
        <>
            <header className="flex items-start justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-foreground mt-1">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">
                        Bienvenido de vuelta. Aquí está el resumen del día.
                    </p>
                </div>
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-3">
                        <p className="text-4xl font-bold text-foreground tabular-nums tracking-tight">
                            {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE })}
                        </p>
                        <button
                            onClick={logout}
                            className="p-2 mb-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                            title="Cerrar Sesión"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                    <p className="text-muted-foreground text-sm mt-1">
                        {currentTime.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: APP_TIMEZONE })}
                    </p>
                </div>
            </header>

            {/* KPIs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {loading ? (
                    Array(4).fill(null).map((_, i) => (
                        <div key={i} className="glass-card h-32 animate-pulse" />
                    ))
                ) : (
                    <>
                        {/* KPIs */}
                        <KPICard titulo="Citas Hoy" valor={kpis.citasHoy} color="purple" icon="calendar" trend={kpis.tendencias.citasHoy} />
                        <KPICard titulo="Completadas" valor={kpis.completadas} color="green" icon="check" trend={kpis.tendencias.completadas} />
                        <KPICard titulo="Ingresos" valor={`$${kpis.ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`} color="blue" icon="money" trend={kpis.tendencias.ingresos} />
                        <KPICard titulo="No-Shows" valor={kpis.noShows} color="red" icon="x" trend={kpis.tendencias.noShows} trendInverse />
                    </>
                )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Recent Appointments */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-foreground">Citas Recientes</h2>
                        <Link href="/admin/citas" className="text-sm text-purple-400 hover:text-purple-300">
                            Ver todas →
                        </Link>
                    </div>
                    
                    <div className="space-y-3 mt-2">
                        {recentCitas.length === 0 ? (
                            <p className="text-muted-foreground text-sm text-center py-4">No hay citas registradas para hoy</p>
                        ) : (
                            recentCitas.map((cita) => {
                                const hora = new Date(cita.timestamp_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE })
                                return (
                                    <div key={cita.id} className="flex items-center justify-between p-3 rounded-xl bg-surface/ hover:bg-surface transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-surface-hover flex items-center justify-center text-sm font-medium text-foreground">
                                                {cita.cliente_nombre.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-foreground">{cita.cliente_nombre}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {cita.servicio?.nombre || 'Servicio General'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-foreground">{hora}</p>
                                            <span className={`text-xs ${cita.estado === 'en_proceso' ? 'text-emerald-400' :
                                                    cita.estado === 'confirmada' ? 'text-blue-400' :
                                                        cita.estado === 'en_espera' ? 'text-amber-400' :
                                                            'text-muted-foreground'
                                                }`}>
                                                {cita.estado.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-foreground mb-4">Acciones Rápidas</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <Link href="/admin/citas" className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors text-left block">
                            <svg className="w-6 h-6 text-purple-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            <p className="text-sm font-medium text-foreground">Nueva Cita</p>
                            <p className="text-xs text-muted-foreground">Agendar manualmente</p>
                        </Link>

                        <Link href="/admin/citas" className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors text-left block">
                            <svg className="w-6 h-6 text-amber-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                            </svg>
                            <p className="text-sm font-medium text-foreground">Walk-in</p>
                            <p className="text-xs text-muted-foreground">Cliente sin cita</p>
                        </Link>

                        <Link href="/admin/citas" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors text-left block">
                            <svg className="w-6 h-6 text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            <p className="text-sm font-medium text-foreground">Bloqueo</p>
                            <p className="text-xs text-muted-foreground">Bloquear horario</p>
                        </Link>

                        <Link href="/admin/reportes" className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-left block">
                            <svg className="w-6 h-6 text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-sm font-medium text-foreground">Reporte</p>
                            <p className="text-xs text-muted-foreground">Generar PDF</p>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Barber Status */}
            <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Estado de Barberos</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {barberStatuses.length === 0 ? (
                        <p className="text-muted-foreground col-span-4 text-center py-4">Cargando estado de barberos...</p>
                    ) : (
                        barberStatuses.map((barbero) => (
                            <div key={barbero.id} className="p-4 rounded-xl bg-surface/ border border-slate-700/50">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-purple-400 flex items-center justify-center font-bold text-foreground">
                                        {barbero.estacion}
                                    </div>
                                    <div>
                                        <p className="font-medium text-foreground">{barbero.nombre}</p>
                                        <p className="text-xs text-muted-foreground">Estación {barbero.estacion}</p>
                                    </div>
                                </div>
                                <div className={`
                px-3 py-1.5 rounded-lg text-xs font-medium text-center
                ${barbero.estado === 'ocupado' ? 'bg-emerald-500/20 text-emerald-400' : ''}
                ${barbero.estado === 'disponible' ? 'bg-blue-500/20 text-blue-400' : ''}
                ${barbero.estado === 'descanso' ? 'bg-amber-500/20 text-amber-400' : ''}
              `}>
                                    {barbero.estado === 'ocupado' && `🔵 ${barbero.cliente}`}
                                    {barbero.estado === 'disponible' && '🟢 Disponible'}
                                    {barbero.estado === 'descanso' && '🟡 En descanso'}
                                </div>
                            </div>
                        )))}
                </div>
            </div>
        </>
    )
}
