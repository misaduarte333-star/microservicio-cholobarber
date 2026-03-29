'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { CitaConRelaciones, EstadoCita } from '@/lib/types'
import { APP_TIMEZONE } from '@/lib/timezone'

/**
 * Propiedades del componente CitaCard
 */
interface CitaCardProps {
    cita: CitaConRelaciones
    onUpdate?: () => void
    isHighlighted?: boolean
    style?: React.CSSProperties
}

/**
 * Tarjeta individual para mostrar la información de una cita (cliente, servicio, horario).
 * Permite cambiar el estado de la cita (ej. Confirmar, Iniciar, Finalizar).
 */
export function CitaCard({ cita, onUpdate, isHighlighted, style }: CitaCardProps) {
    const [loading, setLoading] = useState(false)
    const [supabase] = useState(() => createClient())

    /**
     * Actualiza el estado de la cita en Supabase y ejecuta el callback onUpdate
     */
    const actualizarEstado = async (nuevoEstado: EstadoCita) => {
        setLoading(true)
        try {
            const { error } = await (supabase.from('citas') as any)
                .update({
                    estado: nuevoEstado,
                    updated_at: new Date().toISOString()
                })
                .eq('id', cita.id)

            if (error) {
                console.error('Error updating status:', error)
            }

            onUpdate?.()
        } catch (err) {
            console.error('Failed to update:', err)
        } finally {
            setLoading(false)
        }
    }

    const getStatusConfig = () => {
        switch (cita.estado) {
            case 'confirmada':
                return {
                    bg: 'from-blue-600/90 to-blue-700/90',
                    border: 'border-blue-500/30',
                    badge: 'status-confirmed',
                    label: 'Confirmada'
                }
            case 'en_espera':
                return {
                    bg: 'from-amber-600/90 to-amber-700/90',
                    border: 'border-amber-500/30',
                    badge: 'status-waiting',
                    label: 'En Espera'
                }
            case 'en_proceso':
                return {
                    bg: 'from-emerald-600/90 to-emerald-700/90',
                    border: 'border-emerald-500/30',
                    badge: 'status-in-progress',
                    label: 'En Proceso'
                }
            case 'finalizada':
                return {
                    bg: 'from-slate-600/90 to-slate-700/90',
                    border: 'border-slate-500/30',
                    badge: 'status-completed',
                    label: 'Finalizada'
                }
            case 'cancelada':
            case 'no_show':
                return {
                    bg: 'from-red-600/90 to-red-700/90',
                    border: 'border-red-500/30',
                    badge: 'status-cancelled',
                    label: cita.estado === 'no_show' ? 'No Show' : 'Cancelada'
                }
            default:
                return {
                    bg: 'from-slate-600/90 to-slate-700/90',
                    border: 'border-slate-500/30',
                    badge: 'status-completed',
                    label: cita.estado
                }
        }
    }

    const config = getStatusConfig()
    const horaInicio = new Date(cita.timestamp_inicio).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: APP_TIMEZONE
    })
    const horaFin = new Date(cita.timestamp_fin).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: APP_TIMEZONE
    })

    return (
        <div
            className={`
        rounded-2xl p-5 backdrop-blur-sm border animate-slide-in
        bg-gradient-to-r ${config.bg} ${config.border}
        ${isHighlighted ? 'ring-2 ring-white/30 shadow-lg shadow-emerald-500/20' : ''}
        transition-all duration-300 hover:scale-[1.01]
      `}
            style={style}
        >
            <div className="flex items-start justify-between gap-4">
                {/* Left: Client Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                        {/* Avatar */}
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                            <span className="text-xl font-bold text-white/90">
                                {cita.cliente_nombre.charAt(0).toUpperCase()}
                            </span>
                        </div>

                        <div className="min-w-0">
                            <h3 className="text-xl font-bold text-foreground truncate">
                                {cita.cliente_nombre}
                            </h3>
                            <div className="flex items-center gap-2 text-white/80">
                                <span className={`status-badge ${config.badge}`}>
                                    {config.label}
                                </span>
                                {cita.origen === 'walkin' && (
                                    <span className="status-badge bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                        Walk-in
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Service & Time */}
                    <div className="flex flex-wrap items-center gap-4 text-white/70 text-sm mt-3">
                        <div className="flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                            </svg>
                            <span>{cita.servicio?.nombre || 'Servicio'}</span>
                            <span className="text-white/50">•</span>
                            <span>{cita.servicio?.duracion_minutos || 30} min</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{horaInicio} - {horaFin}</span>
                        </div>
                    </div>

                    {cita.notas && (
                        <p className="mt-2 text-sm text-white/60 italic">
                            📝 {cita.notas}
                        </p>
                    )}
                </div>

                {/* Right: Action Buttons */}
                <div className="flex flex-col gap-2 shrink-0">
                    {cita.estado === 'confirmada' && (
                        <button
                            onClick={() => actualizarEstado('en_espera')}
                            disabled={loading}
                            className="btn-secondary text-sm px-4 py-2 flex items-center gap-2"
                        >
                            {loading ? (
                                <div className="spinner w-4 h-4" />
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                            Check-in
                        </button>
                    )}

                    {cita.estado === 'en_espera' && (
                        <>
                            <button
                                onClick={() => actualizarEstado('en_proceso')}
                                disabled={loading}
                                className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
                            >
                                {loading ? (
                                    <div className="spinner w-4 h-4" />
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                )}
                                Iniciar
                            </button>
                            <button
                                onClick={() => actualizarEstado('no_show')}
                                disabled={loading}
                                className="btn-danger text-sm px-4 py-2 flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                                No Show
                            </button>
                        </>
                    )}

                    {cita.estado === 'en_proceso' && (
                        <button
                            onClick={() => actualizarEstado('finalizada')}
                            disabled={loading}
                            className="btn-primary text-sm px-4 py-2 flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400"
                        >
                            {loading ? (
                                <div className="spinner w-4 h-4" />
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}
                            Finalizar
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
