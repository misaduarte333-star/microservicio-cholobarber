'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Servicio, Barbero } from '@/lib/types'
import { APP_TIMEZONE, todayInTZ } from '@/lib/timezone'

export default function BookingPage() {
    // State for Wizard Steps
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)

    // Data State
    const [servicios, setServicios] = useState<Servicio[]>([])
    const [barberos, setBarberos] = useState<Barbero[]>([])

    // Selection State
    const [selectedService, setSelectedService] = useState<Servicio | null>(null)
    const [selectedBarber, setSelectedBarber] = useState<Barbero | null>(null)
    const [selectedDate, setSelectedDate] = useState<string>('')
    const [selectedTime, setSelectedTime] = useState<string>('')
    const [clientName, setClientName] = useState('')
    const [clientPhone, setClientPhone] = useState('')
    const [clientNote, setClientNote] = useState('')

    const [supabase] = useState(() => createClient())

    // Dynamic sucursal from URL query param: /citas?s=uuid
    const [sucursalId, setSucursalId] = useState<string>('')

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const s = params.get('s')
        if (s) {
            setSucursalId(s)
        } else {
            // Fallback: fetch first active sucursal
            ;(supabase.from('sucursales') as any).select('id').eq('activa', true).limit(1).single()
                .then(({ data }: { data: { id: string } | null }) => { if (data) setSucursalId(data.id) })
        }
    }, [supabase])

    useEffect(() => {
        loadInitialData()
    }, [])

    const loadInitialData = async () => {
        setLoading(true)
        try {
            // Load Services
            const { data: servicesData } = await supabase
                .from('servicios')
                .select('*')
                .eq('activo', true)
                .order('precio')

            if (servicesData) setServicios(servicesData)
            else setServicios(getDemoServices())

            // Load Barbers
            const { data: barbersData } = await supabase
                .from('barberos')
                .select('*')
                .eq('activo', true)

            if (barbersData) setBarberos(barbersData)
            else setBarberos(getDemoBarbers())

        } catch (err) {
            console.error('Error loading data:', err)
            setServicios(getDemoServices())
            setBarberos(getDemoBarbers())
        } finally {
            setLoading(false)
        }
    }

    const handleServiceSelect = (service: Servicio) => {
        setSelectedService(service)
        setStep(2)
    }

    const handleBarberSelect = (barber: Barbero | null) => {
        setSelectedBarber(barber)
        setStep(3)
    }

    const handleTimeSelect = (date: string, time: string) => {
        setSelectedDate(date)
        setSelectedTime(time)
        setStep(4)
    }

    const handleSubmit = async () => {
        setLoading(true)
        try {
            const appointmentData = {
                sucursal_id: sucursalId,
                barbero_id: selectedBarber?.id || barberos[0].id, // Logic to assign random if null
                servicio_id: selectedService?.id,
                cliente_nombre: clientName,
                cliente_telefono: clientPhone,
                timestamp_inicio: new Date(`${selectedDate}T${selectedTime}:00-07:00`).toISOString(),
                timestamp_fin: calculateEndTime(`${selectedDate}T${selectedTime}:00-07:00`, selectedService?.duracion_minutos || 30),
                origen: 'walkin', // or web
                estado: 'confirmada',
                notas: clientNote
            }

            const { error } = await supabase.from('citas').insert([appointmentData] as any)

            if (error) throw error

            alert('¡Cita Confirmada!')
            // Reset or redirect
            window.location.href = '/'

        } catch (err) {
            console.error('Error creating appointment:', err)
            alert('Error al agendar la cita. Intente nuevamente.')
        } finally {
            setLoading(false)
        }
    }

    // Helper to calculate end time
    const calculateEndTime = (startIso: string, durationMinutes: number) => {
        const date = new Date(startIso)
        date.setMinutes(date.getMinutes() + durationMinutes)
        return date.toISOString() // Note: DB expects ISO or timestamp
    }

    // Generate available time slots (Simplified logic for demo)
    const generateTimeSlots = (_dateStr: string) => {
        // In real app, check availability vs existing appointments
        const slots = []
        for (let h = 9; h < 20; h++) {
            slots.push(`${h.toString().padStart(2, '0')}:00`)
            slots.push(`${h.toString().padStart(2, '0')}:30`)
        }
        return slots
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent mb-2">
                        BarberCloud
                    </h1>
                    <p className="text-muted-foreground">Reserva tu próxima experiencia</p>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center justify-between mb-8 relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-surface -z-10 rounded"></div>
                    {[1, 2, 3, 4].map((s) => (
                        <div
                            key={s}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                            ${step >= s ? 'bg-purple-600 text-foreground shadow-lg shadow-purple-900/50' : 'bg-surface text-muted-foreground/70 border border-border'}
                            `}
                        >
                            {s}
                        </div>
                    ))}
                </div>

                {/* Step 1: Select Service */}
                {step === 1 && (
                    <div className="animate-fade-in space-y-4">
                        <h2 className="text-xl font-bold mb-4">Elige un Servicio</h2>
                        {loading ? (
                            <div className="p-10 flex justify-center"><div className="spinner"></div></div>
                        ) : (
                            <div className="grid gap-4">
                                {servicios.map(servicio => (
                                    <div
                                        key={servicio.id}
                                        onClick={() => handleServiceSelect(servicio)}
                                        className="glass-card p-4 hover:border-purple-500/50 cursor-pointer transition-all hover:scale-[1.02] flex justify-between items-center group"
                                    >
                                        <div>
                                            <h3 className="font-bold text-lg group-hover:text-purple-400 transition-colors">{servicio.nombre}</h3>
                                            <p className="text-sm text-muted-foreground">{servicio.duracion_minutos} min</p>
                                        </div>
                                        <div className="text-xl font-bold text-foreground">
                                            ${servicio.precio}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2: Select Barber (Optional logic, passing null means 'Any') */}
                {step === 2 && (
                    <div className="animate-fade-in space-y-4">
                        <h2 className="text-xl font-bold mb-4">Elige tu Profesional</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div
                                onClick={() => handleBarberSelect(null)}
                                className="glass-card p-6 text-center hover:border-purple-500/50 cursor-pointer transition-all hover:scale-[1.02]"
                            >
                                <div className="w-16 h-16 rounded-full bg-surface-hover mx-auto mb-3 flex items-center justify-center text-2xl">🎲</div>
                                <h3 className="font-bold">Cualquiera</h3>
                                <p className="text-xs text-muted-foreground mt-1">El primero disponible</p>
                            </div>
                            {barberos.map(barbero => (
                                <div
                                    key={barbero.id}
                                    onClick={() => handleBarberSelect(barbero)}
                                    className="glass-card p-6 text-center hover:border-purple-500/50 cursor-pointer transition-all hover:scale-[1.02]"
                                >
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 mx-auto mb-3 flex items-center justify-center text-xl font-bold text-foreground">
                                        {barbero.nombre[0]}
                                    </div>
                                    <h3 className="font-bold text-sm">{barbero.nombre}</h3>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setStep(1)} className="text-muted-foreground text-sm mt-4 hover:text-foreground">← Volver</button>
                    </div>
                )}

                {/* Step 3: Select Date & Time */}
                {step === 3 && (
                    <div className="animate-fade-in space-y-4">
                        <h2 className="text-xl font-bold mb-4">Fecha y Hora</h2>

                        <div className="glass-card p-4 mb-4">
                            <label className="block text-sm text-muted-foreground mb-2">Fecha</label>
                            <input
                                type="date"
                                className="input-field"
                                min={todayInTZ()}
                                onChange={(e) => setSelectedDate(e.target.value)}
                            />
                        </div>

                        {selectedDate && (
                            <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                {generateTimeSlots(selectedDate).map(time => (
                                    <button
                                        key={time}
                                        onClick={() => handleTimeSelect(selectedDate, time)}
                                        className="py-2 rounded-lg bg-surface hover:bg-purple-600 hover:text-foreground text-muted transition-colors text-sm font-medium border border-border"
                                    >
                                        {time}
                                    </button>
                                ))}
                            </div>
                        )}

                        <button onClick={() => setStep(2)} className="text-muted-foreground text-sm mt-4 hover:text-foreground">← Volver</button>
                    </div>
                )}

                {/* Step 4: Confirmation & Details */}
                {step === 4 && (
                    <div className="animate-fade-in space-y-6">
                        <h2 className="text-xl font-bold mb-4">Completa tu Reserva</h2>

                        <div className="glass-card p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Nombre Completo</label>
                                <input
                                    type="text"
                                    value={clientName}
                                    onChange={e => setClientName(e.target.value)}
                                    className="input-field"
                                    placeholder="Ej. Juan Pérez"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Teléfono</label>
                                <input
                                    type="tel"
                                    value={clientPhone}
                                    onChange={e => setClientPhone(e.target.value)}
                                    className="input-field"
                                    placeholder="Ej. 55 1234 5678"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-muted-foreground mb-1">Notas (Opcional)</label>
                                <textarea
                                    value={clientNote}
                                    onChange={e => setClientNote(e.target.value)}
                                    className="input-field min-h-[80px]"
                                    placeholder="Alergias, preferencias..."
                                />
                            </div>
                        </div>

                        <div className="bg-surface/ p-4 rounded-xl border border-border">
                            <h3 className="font-bold text-foreground mb-2">Resumen</h3>
                            <div className="text-sm space-y-1 text-muted-foreground">
                                <p>🗓️ {selectedDate} a las {selectedTime}</p>
                                <p>✂️ {selectedService?.nombre} (${selectedService?.precio})</p>
                                <p>💈 {selectedBarber ? selectedBarber.nombre : 'Cualquier profesional'}</p>
                            </div>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={loading || !clientName || !clientPhone}
                            className="w-full btn-primary py-4 text-lg shadow-xl shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Confirmando...' : 'Confirmar Cita'}
                        </button>

                        <div className="text-center">
                            <button onClick={() => setStep(3)} className="text-muted-foreground text-sm hover:text-foreground">← Volver</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

function getDemoServices(): Servicio[] {
    return [
        { id: '1', sucursal_id: '1', nombre: 'Corte Clásico', duracion_minutos: 40, precio: 250, activo: true, created_at: '' },
        { id: '2', sucursal_id: '1', nombre: 'Barba', duracion_minutos: 30, precio: 150, activo: true, created_at: '' },
        { id: '3', sucursal_id: '1', nombre: 'Combo Completo', duracion_minutos: 60, precio: 350, activo: true, created_at: '' },
    ]
}

function getDemoBarbers(): Barbero[] {
    return [
        { id: '1', sucursal_id: '1', nombre: 'Carlos H.', estacion_id: 1, usuario_tablet: '', password_hash: '', horario_laboral: {}, bloqueo_almuerzo: null, activo: true, hora_entrada: null, created_at: '' },
        { id: '2', sucursal_id: '1', nombre: 'Miguel L.', estacion_id: 2, usuario_tablet: '', password_hash: '', horario_laboral: {}, bloqueo_almuerzo: null, activo: true, hora_entrada: null, created_at: '' },
    ]
}
