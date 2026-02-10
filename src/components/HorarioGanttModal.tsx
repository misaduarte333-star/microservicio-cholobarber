import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Barbero, Sucursal, DiasSemana } from '@/lib/types'

// Simple CSS pattern for lunch
const styles = `
.pattern-diagonal-lines {
  background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(239, 68, 68, 0.2) 5px, rgba(239, 68, 68, 0.2) 10px);
}
`

interface HorarioGanttModalProps {
    isOpen: boolean
    onClose: () => void
    barberos: (Barbero & { sucursal?: Partial<Sucursal> })[]
    sucursal?: Partial<Sucursal> | null
}

export function HorarioGanttModal({ isOpen, onClose, barberos, sucursal }: HorarioGanttModalProps) {
    const [selectedDay, setSelectedDay] = useState<DiasSemana>('lunes')

    const dias: DiasSemana[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

    // Generate time slots (every 30 mins)
    // We'll base the start/end on the Sucursal's max range or a fixed range (e.g. 7am to 10pm)
    // For visualization, 08:00 to 20:00 is standard, but flexible is better.
    const START_HOUR = 7
    const END_HOUR = 24

    const hours = useMemo(() => {
        const h = []
        for (let i = START_HOUR; i <= END_HOUR; i++) {
            h.push(i)
        }
        return h
    }, [])



    // Helper to check if a specific time is within a range string "HH:MM"-"HH:MM"
    const isWithinTime = (time: number, rangeStr?: { inicio: string, fin: string } | { apertura: string, cierre: string } | null) => {
        if (!rangeStr) return false

        // Handle both 'inicio/fin' and 'apertura/cierre' formats
        const startStr = 'inicio' in rangeStr ? rangeStr.inicio : (rangeStr as any).apertura
        const endStr = 'fin' in rangeStr ? rangeStr.fin : (rangeStr as any).cierre

        if (!startStr || !endStr) return false

        const [startH, startM] = startStr.split(':').map(Number)
        const [endH, endM] = endStr.split(':').map(Number)

        // Simpler logic: Is the current hour block (e.g. 9) inside the range [9, 18)?
        // If range is 09:00 - 18:00. 9 is in. 17 is in. 18 is out.
        return time >= startH && time < endH
    }

    // Get current day's Sucursal schedule
    const sucursalSchedule = sucursal?.horario_apertura?.[selectedDay]

    // Handle hydration/SSR safely
    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
        return () => setMounted(false)
    }, [])

    if (!isOpen || !mounted) return null

    // Portal to body to avoid stacking context issues with Sidebar

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <style>{styles}</style>
            <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 w-full max-w-6xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Horarios del Equipo</h2>
                        <p className="text-slate-400">Visualización de disponibilidad vs Horario Sucursal</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Day Selector */}
                <div className="flex border-b border-slate-800 overflow-x-auto">
                    {dias.map((dia) => (
                        <button
                            key={dia}
                            onClick={() => setSelectedDay(dia)}
                            className={`px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${selectedDay === dia
                                    ? 'bg-blue-600/10 text-blue-400 border-b-2 border-blue-500'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }`}
                        >
                            {dia.charAt(0).toUpperCase() + dia.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-auto p-6">
                    <div className="min-w-[800px]">
                        {/* Timeline Header */}
                        <div className="grid grid-cols-[200px_1fr] mb-4">
                            <div className="text-slate-500 text-xs uppercase font-bold tracking-wider pt-2">Recurso / Hora</div>
                            <div className="grid" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
                                {hours.map(hour => (
                                    <div key={hour} className="text-center">
                                        <span className="text-xs text-slate-500">{hour}:00</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Sucursal Row (Master) */}
                        <div className="grid grid-cols-[200px_1fr] mb-6 group">
                            <div className="flex items-center gap-3 py-3 pr-4">
                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-medium text-white text-sm">Sucursal</p>
                                    <p className="text-[10px] text-slate-500">Horario Apertura</p>
                                </div>
                            </div>
                            <div className="grid relative" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
                                {/* Background Grid Lines */}
                                {hours.map((_, i) => (
                                    <div key={i} className="border-l border-slate-800 h-full absolute top-0 bottom-0" style={{ left: `${(i / hours.length) * 100}%` }} />
                                ))}

                                {hours.map(hour => {
                                    const isOpen = isWithinTime(hour, sucursalSchedule)
                                    return (
                                        <div key={hour} className="h-12 m-0.5 rounded transition-all relative z-10 flex items-center justify-center">
                                            {isOpen && (
                                                <div className="w-full h-2 bg-slate-600 rounded-full opacity-50" title="Abierto" />
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="h-px bg-slate-800 mb-6" />

                        {/* Barbers Rows */}
                        <div className="space-y-4">
                            {barberos.map(barbero => {
                                const workSchedule = barbero.horario_laboral[selectedDay]

                                return (
                                    <div key={barbero.id} className="grid grid-cols-[200px_1fr] group hover:bg-slate-800/20 rounded-lg transition-colors">
                                        <div className="flex items-center gap-3 py-2 pr-4 pl-2">
                                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
                                                {barbero.nombre.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-200 text-sm">{barbero.nombre}</p>
                                                <p className="text-[10px] text-slate-500">Estación {barbero.estacion_id}</p>
                                            </div>
                                        </div>

                                        <div className="grid relative items-center" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
                                            {/* Background Grid Lines */}
                                            {hours.map((_, i) => (
                                                <div key={i} className="border-l border-slate-800/50 h-full absolute top-0 bottom-0" style={{ left: `${(i / hours.length) * 100}%` }} />
                                            ))}

                                            {hours.map(hour => {
                                                const isWorking = isWithinTime(hour, workSchedule)

                                                // Check for lunch
                                                let isLunch = false
                                                if (barbero.bloqueo_almuerzo && barbero.bloqueo_almuerzo.inicio && barbero.bloqueo_almuerzo.fin) {
                                                    const startH = parseInt(barbero.bloqueo_almuerzo.inicio.split(':')[0])
                                                    const endH = parseInt(barbero.bloqueo_almuerzo.fin.split(':')[0])

                                                    // Simple hour inclusion: if the current hour block STARTS inside the lunch window
                                                    // e.g. Lunch 14:00-15:00. Hour 14 is lunch.
                                                    if (hour >= startH && hour < endH) {
                                                        isLunch = true
                                                    }
                                                }

                                                let bgClass = ''
                                                if (isLunch) bgClass = 'bg-red-500/20 border-red-500/40 pattern-diagonal-lines'
                                                else if (isWorking) bgClass = 'bg-blue-500/30 border border-blue-500/30'

                                                return (
                                                    <div key={hour} className="h-full px-0.5 py-2 relative z-10">
                                                        {(isWorking || isLunch) && (
                                                            <div
                                                                className={`w-full h-full rounded flex items-center justify-center ${bgClass} ${isLunch ? 'border border-red-500/30' : ''}`}
                                                                title={isLunch ? 'Almuerzo' : 'Trabajando'}
                                                            >
                                                                {isLunch && <span className="text-[10px]">🍽️</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* Legend */}
                <div className="p-4 border-t border-slate-800 flex gap-6 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-slate-600 rounded-full opacity-50"></div>
                        <span>Horario Sucursal</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500/30 border border-blue-500/30 rounded"></div>
                        <span>Turno Barbero</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500/20 border border-red-500/30 rounded flex items-center justify-center pattern-diagonal-lines">🍽️</div>
                        <span>Almuerzo</span>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
