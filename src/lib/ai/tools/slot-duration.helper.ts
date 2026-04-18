/**
 * ============================================================================
 * SLOT DURATION HELPER
 * ============================================================================
 * Utilidades para manejar duraciones de citas respetando bloques de 30 minutos.
 * 
 * Regla: Los slots SIEMPRE deben ser en bloques de 30 minutos (:00 o :30)
 * Nunca :10, :26, :36, etc.
 */

/**
 * Redondea una duración en minutos al próximo bloque de 30 minutos
 * 
 * Ejemplos:
 * - 15 minutos → 30 minutos (1 bloque)
 * - 30 minutos → 30 minutos (1 bloque)
 * - 45 minutos → 60 minutos (2 bloques)
 * - 60 minutos → 60 minutos (2 bloques)
 * - 90 minutos → 90 minutos (3 bloques)
 * - 100 minutos → 120 minutos (4 bloques)
 */
export function roundDurationTo30MinBlocks(durationMinutes: number): number {
    if (durationMinutes <= 0) return 30
    
    const blocks = Math.ceil(durationMinutes / 30)
    return blocks * 30
}

/**
 * Validar que una duración es válida (múltiplo de 30)
 */
export function isValidSlotDuration(durationMinutes: number): boolean {
    return durationMinutes > 0 && durationMinutes % 30 === 0
}

/**
 * Convertir duración en minutos a representación legible
 * ej: 30 → "30 min", 60 → "1 hora", 90 → "1 hora 30 min"
 */
export function formatDuration(durationMinutes: number): string {
    const hours = Math.floor(durationMinutes / 60)
    const minutes = durationMinutes % 60
    
    if (hours === 0) return `${minutes} min`
    if (minutes === 0) return `${hours} hora${hours > 1 ? 's' : ''}`
    return `${hours} hora${hours > 1 ? 's' : ''} ${minutes} min`
}

/**
 * Calcular timestamp de fin basado en inicio + duración
 * Asegura que respeta bloques de 30 minutos
 * 
 * @param startDate: Fecha/hora de inicio (debe ser :00 o :30)
 * @param durationMinutes: Duración en minutos (se redondea a 30)
 * @returns Fecha/hora de fin
 */
export function calculateEndTime(startDate: Date, durationMinutes: number): Date {
    const validDuration = roundDurationTo30MinBlocks(durationMinutes)
    const endDate = new Date(startDate)
    endDate.setMinutes(endDate.getMinutes() + validDuration)
    return endDate
}

/**
 * Verificar si una hora está en bloque de 30 minutos (:00 o :30)
 */
export function isValidSlotTime(date: Date): boolean {
    const minutes = date.getMinutes()
    return minutes === 0 || minutes === 30
}

/**
 * Redondear una hora al próximo bloque de 30 minutos válido
 * Si es 14:15 → 14:30
 * Si es 14:45 → 15:00
 */
export function roundToNextValidSlot(date: Date): Date {
    const rounded = new Date(date)
    const minutes = rounded.getMinutes()
    
    // Si ya está en un bloque válido, devolver tal cual
    if (minutes === 0 || minutes === 30) {
        return rounded
    }
    
    // Si es antes de :30, redondear a :30
    if (minutes < 30) {
        rounded.setMinutes(30, 0, 0)
    } 
    // Si es después de :30, redondear a la siguiente hora
    else {
        rounded.setHours(rounded.getHours() + 1, 0, 0, 0)
    }
    
    return rounded
}

/**
 * Obtener modo de slots para sucursal y calcular duración real
 * 
 * @param mode: 'fixed_30min' | 'fixed_1hour' | 'by_service'
 * @param serviceDurationMinutes: Duración del servicio (si mode = 'by_service')
 * @returns Duración a usar para el slot en minutos
 */
export function getSlotDuration(
    mode: 'fixed_30min' | 'fixed_1hour' | 'by_service',
    serviceDurationMinutes: number = 30
): number {
    switch (mode) {
        case 'fixed_30min':
            return 30
        case 'fixed_1hour':
            return 60
        case 'by_service':
            // Redondear duración del servicio a bloques de 30
            return roundDurationTo30MinBlocks(serviceDurationMinutes)
        default:
            return 30 // fallback
    }
}

/**
 * Validar disponibilidad considerando duración real
 * 
 * Devuelve true si NO hay conflictos entre:
 * - Slot solicitado: [slotStart, slotStart + duration]
 * - Citas existentes: [citaStart, citaEnd]
 */
export function hasSlotAvailability(
    slotStart: Date,
    slotDurationMinutes: number,
    existingAppointments: Array<{ timestamp_inicio: string; timestamp_fin: string }>
): boolean {
    const slotEnd = calculateEndTime(slotStart, slotDurationMinutes)
    const slotStartIso = slotStart.toISOString()
    const slotEndIso = slotEnd.toISOString()
    
    // Verificar si hay solapamiento con alguna cita existente
    const hasConflict = existingAppointments.some(cita => {
        const citaStart = new Date(cita.timestamp_inicio)
        const citaEnd = new Date(cita.timestamp_fin)
        
        // Hay conflicto si:
        // - Slot empieza antes de que termine la cita, Y
        // - Slot termina después de que empiece la cita
        return slotStart < citaEnd && slotEnd > citaStart
    })
    
    return !hasConflict
}
