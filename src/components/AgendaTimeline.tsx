'use client'

import { useMemo } from 'react'
import type { CitaConRelaciones } from '@/lib/types'
import { APP_TIMEZONE } from '@/lib/timezone'

/**
 * Propiedades del componente AgendaTimeline
 */
interface AgendaTimelineProps {
    citas: CitaConRelaciones[]
    currentTime: Date
    horaInicio?: number
    horaFin?: number
}

// Generate time slots from 8:00 to 20:00 (8am to 8pm)
const HORA_INICIO = 8
const HORA_FIN = 20
const INTERVALO_MINUTOS = 30

/**
 * Genera bloques de tiempo (slots) desde la hora de inicio hasta la hora de fin
 * @returns Arreglo de strings en formato HH:MM
 */
function generarSlots(horaInicio: number, horaFin: number): string[] {
    const slots: string[] = []
    for (let hora = horaInicio; hora < horaFin; hora++) {
        for (let minuto = 0; minuto < 60; minuto += INTERVALO_MINUTOS) {
            slots.push(`${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`)
        }
    }
    return slots
}

/**
 * Componente visual que muestra las citas de un día a modo de línea de tiempo vertical.
 * Incluye un indicador visual de la hora actual.
 * @param citas Lista de citas a mostrar
 * @param currentTime Hora actual utilizada para dibujar la línea de tiempo en vivo
 * @param horaInicio (Opcional) Hora en la que inicia la línea del tiempo (ej. 8)
 * @param horaFin (Opcional) Hora en la que termina la línea del tiempo (ej. 20)
 */
export function AgendaTimeline({ citas, currentTime, horaInicio = 8, horaFin = 20 }: AgendaTimelineProps) {
    const slots = useMemo(() => generarSlots(horaInicio, horaFin), [horaInicio, horaFin])

    // Calculate current time position (percentage from top)
    // Use timezone-aware hour/minute extraction
    const currentHour = parseInt(currentTime.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false, timeZone: APP_TIMEZONE }), 10)
    const currentMinute = parseInt(currentTime.toLocaleTimeString('en-US', { minute: '2-digit', timeZone: APP_TIMEZONE }), 10)
    const totalMinutesRange = (horaFin - horaInicio) * 60
    const currentMinutesFromStart = (currentHour - horaInicio) * 60 + currentMinute
    const currentTimePosition = Math.max(0, Math.min(100, (currentMinutesFromStart / totalMinutesRange) * 100))

    // Check if a slot has an appointment
    const getCitaEnSlot = (slot: string) => {
        const [slotHora, slotMinuto] = slot.split(':').map(Number)
        // Build slot time in Hermosillo timezone (UTC-7, no DST)
        const todayStr = currentTime.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
        const slotTime = new Date(`${todayStr}T${slot}:00-07:00`)

        return citas.find(cita => {
            if (['cancelada'].includes(cita.estado)) return false

            const citaInicio = new Date(cita.timestamp_inicio)
            const citaFin = new Date(cita.timestamp_fin)

            return slotTime >= citaInicio && slotTime < citaFin
        })
    }

    const getStatusColor = (estado: string) => {
        switch (estado) {
            case 'confirmada': return 'bg-blue-500'
            case 'en_espera': return 'bg-amber-500'
            case 'en_proceso': return 'bg-emerald-500'
            case 'finalizada': return 'bg-slate-500'
            case 'no_show': return 'bg-red-500'
            case 'cancelada': return 'bg-red-900'
            default: return 'bg-slate-500'
        }
    }

    // Check if current time is within working hours
    const dentroHorario = currentHour >= horaInicio && currentHour < horaFin

    return (
        <div className="relative flex-1 overflow-y-auto pr-2">
            {/* Current time indicator */}
            {dentroHorario && (
                <div
                    className="current-time-line"
                    style={{ top: `${currentTimePosition}%` }}
                >
                    {/* Time label */}
                    <span className="absolute -left-1 -top-2.5 bg-red-500 text-foreground text-xs px-1.5 py-0.5 rounded font-medium">
                        {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: APP_TIMEZONE })}
                    </span>
                </div>
            )}

            {/* Time slots */}
            <div className="space-y-0">
                {slots.map((slot, index) => {
                    const cita = getCitaEnSlot(slot)
                    const isHour = slot.endsWith(':00')
                    const [slotHora, slotMinuto] = slot.split(':').map(Number)
                    const isPast = slotHora < currentHour || (slotHora === currentHour && slotMinuto < currentMinute)

                    return (
                        <div
                            key={slot}
                            className={`
                relative flex items-center gap-3 py-2 px-2 rounded-lg transition-colors duration-200
                ${isPast ? 'opacity-50' : ''}
                ${isHour ? 'border-t border-slate-700/50' : ''}
                ${cita ? 'bg-surface/50' : 'hover:bg-surface/50'}
              `}
                        >
                            {/* Time label */}
                            <div className={`
                w-12 text-xs font-mono shrink-0
                ${isHour ? 'text-muted font-medium' : 'text-muted-foreground/70'}
              `}>
                                {slot}
                            </div>

                            {/* Slot indicator */}
                            <div className="relative flex-1">
                                {cita ? (
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${getStatusColor(cita.estado)} shrink-0`} />
                                        <span className="text-sm text-foreground truncate">
                                            {cita.cliente_nombre}
                                        </span>
                                        <span className="text-xs text-muted-foreground/70">
                                            {cita.servicio?.nombre}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="h-5 border-l-2 border-border" />
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Legend */}
            <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border mt-4 pt-3 pb-2 px-2">
                <div className="flex flex-wrap gap-3 text-xs">
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-muted-foreground">Confirmada</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-muted-foreground">Espera</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-muted-foreground">En Proceso</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-slate-500" />
                        <span className="text-muted-foreground">Finalizada</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-muted-foreground">No Show</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
