'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { APP_TIMEZONE, startOfDayISO, endOfDayISO } from '@/lib/timezone'
import { CitaCard } from '@/components/CitaCard'
import { AgendaTimeline } from '@/components/AgendaTimeline'
import type { CitaConRelaciones } from '@/lib/types'

/**
 * Tablero principal de la tablet del barbero.
 * Muestra las citas del barbero autenticado para el día en curso e incluye
 * suscripción en tiempo real a Supabase para actualizaciones instantáneas.
 */
export default function TabletDashboard() {
    const router = useRouter()
    const { logout } = useAuth()
    const [citas, setCitas] = useState<CitaConRelaciones[]>([])
    const [loading, setLoading] = useState(true)
    const [currentTime, setCurrentTime] = useState(new Date())
    const [barbero, setBarbero] = useState<{ id: string, nombre: string, estacion_id: number, horario_laboral?: any } | null>(null)

    const [supabase] = useState(() => createClient())

    // Auth Check
    useEffect(() => {
        const sessionStr = sessionStorage.getItem('barbero_session')
        if (!sessionStr) {
            router.push('/')
            return
        }
        try {
            const session = JSON.parse(sessionStr)
            setBarbero(session)
        } catch {
            router.push('/')
        }
    }, [router])

    /**
     * Recupera de la base de datos las citas programadas para el barbero activo
     * durante el día actual.
     */
    const cargarCitas = useCallback(async () => {
        if (!barbero?.id) return

        const inicioDelDia = startOfDayISO()
        const finDelDia = endOfDayISO()

        try {
            const { data, error } = await supabase
                .from('citas')
                .select(`
          *,
          servicio:servicios(*)
        `)
                .eq('barbero_id', barbero.id) // Filter by logged in barber
                .gte('timestamp_inicio', inicioDelDia)
                .lte('timestamp_inicio', finDelDia)
                .neq('estado', 'cancelada')
                .order('timestamp_inicio', { ascending: true })

            if (error) {
                console.error('Error loading appointments:', error)
                // Use demo data if Supabase not configured (and matches barber roughly)
                // In production we would just show empty or error
                setCitas([])
            } else {
                setCitas(data || [])
            }
        } catch (err) {
            console.error('Supabase not configured:', err)
            setCitas([])
        } finally {
            setLoading(false)
        }
    }, [supabase, barbero])

    // Load appointments and set up real-time subscription
    useEffect(() => {
        if (!barbero) return

        cargarCitas()

        // Real-time subscription
        const channel = supabase
            .channel(`citas-barbero-${barbero.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'citas',
                    filter: `barbero_id=eq.${barbero.id}` // Only listen for this barber
                },
                (payload) => {
                    console.log('Real-time change:', payload)
                    cargarCitas()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [cargarCitas, supabase, barbero])

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date())
        }, 60000)

        return () => clearInterval(interval)
    }, [])

    const citasActivas = citas.filter(c =>
        c.estado !== 'finalizada' && c.estado !== 'cancelada' && c.estado !== 'no_show'
    )

    const citasCompletadas = citas.filter(c => c.estado === 'finalizada')
    const acumulado = citasCompletadas.reduce((acc, c) => acc + (c.servicio?.precio || 0), 0)

    const citaEnProceso = citas.find(c => c.estado === 'en_proceso')
    const citasSiguientes = citasActivas.filter(c => c.estado !== 'en_proceso')

    const horarioTimeline = (() => {
        let inicio = 8
        let fin = 20

        if (barbero?.horario_laboral) {
            const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
            const diaActual = diasSemana[currentTime.getDay()]
            const horarioHoy = barbero.horario_laboral[diaActual]

            if (horarioHoy && horarioHoy.inicio && horarioHoy.fin) {
                inicio = parseInt(horarioHoy.inicio.split(':')[0], 10)
                fin = parseInt(horarioHoy.fin.split(':')[0], 10)
                const finMinutos = parseInt(horarioHoy.fin.split(':')[1] || '0', 10)
                if (finMinutos > 0) fin += 1
                if (isNaN(inicio) || isNaN(fin)) { inicio = 8; fin = 20 }
            }
        }

        // Expanded bounds strictly based on existing matching appointments
        citas.forEach(c => {
            const h = parseInt(new Date(c.timestamp_inicio).toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: APP_TIMEZONE }), 10)
            const hEnd = parseInt(new Date(c.timestamp_fin).toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: APP_TIMEZONE }), 10)
            const mEnd = parseInt(new Date(c.timestamp_fin).toLocaleTimeString('en-US', { minute: '2-digit', timeZone: APP_TIMEZONE }), 10)
            if (h < inicio) inicio = h
            if (hEnd > fin || (hEnd === fin && mEnd > 0)) fin = hEnd + 1
        })

        return { inicio, fin }
    })()

    return (
        <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
            {/* Header */}
            <header className="bg-surface/50 backdrop-blur-xl border-b border-slate-700/50 px-6 py-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-400 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">{barbero?.nombre || 'Cargando...'}</h1>
                            <p className="text-sm text-muted-foreground">
                                Estación {barbero?.estacion_id} • {currentTime.toLocaleDateString('es-MX', {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long',
                                    timeZone: APP_TIMEZONE
                                })}
                            </p>
                        </div>
                    </div>

                    {/* Central stats (Pending, Completed, Total Acumulado) */}
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                        <div className="flex items-center gap-2 bg-amber-500/10 text-amber-500 px-3 py-1.5 rounded-full text-xs font-semibold border border-amber-500/20 whitespace-nowrap">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            {citasActivas.length} PENDIENTES
                        </div>
                        <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-full text-xs font-semibold border border-emerald-500/20 whitespace-nowrap">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            {citasCompletadas.length} COMPLETADAS
                        </div>
                        <div className="flex items-center gap-4 bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-700/50 whitespace-nowrap">
                            <div className="text-center">
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Citas Hoy</p>
                                <p className="text-sm font-bold leading-none mt-1">{citas.length}</p>
                            </div>
                            <div className="w-px h-6 bg-slate-700/50"></div>
                            <div className="text-center">
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Acumulado</p>
                                <p className="text-sm font-bold text-emerald-400 leading-none mt-1">${acumulado.toLocaleString('es-MX')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 shrink-0">
                        <div className="text-right hidden xl:block">
                            <p className="text-3xl font-bold tabular-nums">
                                {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE })}
                            </p>
                        </div>
                        <button
                            onClick={logout}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                            title="Cerrar Sesión"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
                    {/* Timeline - Left Column */}
                    <div className="lg:col-span-1 h-full overflow-hidden">
                        <div className="glass-card p-4 h-full flex flex-col">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Línea del Tiempo
                            </h2>
                            <AgendaTimeline citas={citas} currentTime={currentTime} horaInicio={horarioTimeline.inicio} horaFin={horarioTimeline.fin} />
                        </div>
                    </div>

                    {/* Appointments - Right Columns */}
                    <div className="lg:col-span-2 overflow-y-auto space-y-6 pr-2">
                        {/* Current Appointment */}
                        {citaEnProceso && (
                            <div>
                                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    En Proceso
                                </h2>
                                <CitaCard cita={citaEnProceso} onUpdate={cargarCitas} isHighlighted />
                            </div>
                        )}

                        {/* Upcoming Appointments */}
                        <div>
                            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                                Próximas Citas ({citasSiguientes.length})
                            </h2>

                            {loading ? (
                                <div className="glass-card p-12 flex items-center justify-center">
                                    <div className="spinner w-8 h-8" />
                                </div>
                            ) : citasSiguientes.length === 0 ? (
                                <div className="glass-card p-12 text-center">
                                    <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-muted-foreground/70">No hay más citas programadas</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {citasSiguientes.map((cita, index) => (
                                        <CitaCard
                                            key={cita.id}
                                            cita={cita}
                                            onUpdate={cargarCitas}
                                            style={{ animationDelay: `${index * 100}ms` }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}


