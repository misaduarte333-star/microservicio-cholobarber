'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { KPICard } from '@/components/KPICard'
import Link from 'next/link'
import type { KPIs } from '@/lib/types'

export default function AdminDashboard() {
    const [kpis, setKpis] = useState<KPIs>({
        citasHoy: 0,
        completadas: 0,
        ingresos: 0,
        noShows: 0
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

    const cargarKPIs = useCallback(async () => {
        const hoy = new Date()
        const inicioDelDia = new Date(hoy.setHours(0, 0, 0, 0)).toISOString()
        const finDelDia = new Date(hoy.setHours(23, 59, 59, 999)).toISOString()

        try {
            // 1. Fetch Citas Today
            const { data: citasHoy, error: errorCitas } = await (supabase
                .from('citas') as any)
                .select('*, servicio:servicios(nombre, precio)')
                .gte('timestamp_inicio', inicioDelDia)
                .lte('timestamp_inicio', finDelDia)

            if (errorCitas) throw errorCitas

            // 2. Fetch Active Barbers
            const { data: barberos, error: errorBarberos } = await supabase
                .from('barberos')
                .select('*')
                .eq('activo', true)
                .order('estacion_id')

            if (errorBarberos) throw errorBarberos

            // 3. Process FAQs/Stats
            const completadas = citasHoy?.filter((c: any) => c.estado === 'finalizada') || []
            const noShows = citasHoy?.filter((c: any) => c.estado === 'no_show').length || 0
            const ingresos = completadas.reduce((sum: number, c: any) => sum + parseFloat(c.servicio?.precio || 0), 0)

            setKpis({
                citasHoy: citasHoy?.length || 0,
                completadas: completadas.length,
                ingresos,
                noShows
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
            console.error('Error loading dashboard data:', err)
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
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                    <p className="text-slate-400 mt-1">
                        Bienvenido de vuelta. Aquí está el resumen del día.
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-bold text-white tabular-nums">
                        {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                    <p className="text-slate-400">
                        {currentTime.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
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
                        <KPICard
                            titulo="Citas Hoy"
                            valor={kpis.citasHoy}
                            color="purple"
                            icon="calendar"
                            trend={+15}
                        />
                        <KPICard
                            titulo="Completadas"
                            valor={kpis.completadas}
                            color="green"
                            icon="check"
                            trend={+8}
                        />
                        <KPICard
                            titulo="Ingresos"
                            valor={`$${kpis.ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                            color="blue"
                            icon="money"
                            trend={+22}
                        />
                        <KPICard
                            titulo="No-Shows"
                            valor={kpis.noShows}
                            color="red"
                            icon="x"
                            trend={-5}
                            trendInverse
                        />
                    </>
                )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Recent Appointments */}
                <div className="glass-card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white">Citas Recientes</h2>
                        <Link href="/admin/citas" className="text-sm text-purple-400 hover:text-purple-300">
                            Ver todas →
                        </Link>
                    </div>
                    {/* Simplified Recent list for now - ideally also dynamic */}
                    <div className="space-y-3">
                        <p className="text-slate-400 text-sm">Mostrando últimas citas...</p>
                        {/* 
                           To keep this simple and focused on the user request (Barber Status), 
                           I am leaving this placeholder or we could map from 'citasHoy' too. 
                           Let's map from 'citasHoy' for better experience.
                        */}
                    </div>
                    <div className="space-y-3 mt-2">
                        {recentCitas.length === 0 ? (
                            <p className="text-slate-500 text-sm text-center py-4">No hay citas registradas para hoy</p>
                        ) : (
                            recentCitas.map((cita) => {
                                const hora = new Date(cita.timestamp_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                                return (
                                    <div key={cita.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium text-white">
                                                {cita.cliente_nombre.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{cita.cliente_nombre}</p>
                                                <p className="text-xs text-slate-400">
                                                    {cita.servicio?.nombre || 'Servicio General'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-white">{hora}</p>
                                            <span className={`text-xs ${cita.estado === 'en_proceso' ? 'text-emerald-400' :
                                                    cita.estado === 'confirmada' ? 'text-blue-400' :
                                                        cita.estado === 'en_espera' ? 'text-amber-400' :
                                                            'text-slate-400'
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
                    <h2 className="text-lg font-semibold text-white mb-4">Acciones Rápidas</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <Link href="/admin/citas" className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors text-left block">
                            <svg className="w-6 h-6 text-purple-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            <p className="text-sm font-medium text-white">Nueva Cita</p>
                            <p className="text-xs text-slate-400">Agendar manualmente</p>
                        </Link>

                        <Link href="/admin/citas" className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors text-left block">
                            <svg className="w-6 h-6 text-amber-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                            </svg>
                            <p className="text-sm font-medium text-white">Walk-in</p>
                            <p className="text-xs text-slate-400">Cliente sin cita</p>
                        </Link>

                        <Link href="/admin/citas" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors text-left block">
                            <svg className="w-6 h-6 text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            <p className="text-sm font-medium text-white">Bloqueo</p>
                            <p className="text-xs text-slate-400">Bloquear horario</p>
                        </Link>

                        <Link href="/admin/reportes" className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-left block">
                            <svg className="w-6 h-6 text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-sm font-medium text-white">Reporte</p>
                            <p className="text-xs text-slate-400">Generar PDF</p>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Barber Status */}
            <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Estado de Barberos</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {barberStatuses.length === 0 ? (
                        <p className="text-slate-400 col-span-4 text-center py-4">Cargando estado de barberos...</p>
                    ) : (
                        barberStatuses.map((barbero) => (
                            <div key={barbero.id} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-purple-400 flex items-center justify-center font-bold text-white">
                                        {barbero.estacion}
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">{barbero.nombre}</p>
                                        <p className="text-xs text-slate-400">Estación {barbero.estacion}</p>
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
