import { createClient } from './supabase'
import type {
    ValidacionResultado,
    DiasSemana,
    HorarioApertura,
    HorarioLaboralSemana,
    BloqueAlmuerzo
} from './types'

// ============================================================================
// Helper: Get day of week in Spanish
// ============================================================================
/**
 * Obtiene el día de la semana en formato texto (español) a partir de un objeto Date.
 * @param fecha Fecha a evaluar.
 * @returns El día de la semana correspondiente.
 */
function getDiaSemana(fecha: Date): DiasSemana {
    const dias: DiasSemana[] = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
    return dias[fecha.getDay()]
}

// ============================================================================
// Helper: Check if time is within a range
// ============================================================================
/**
 * Evalúa si una hora específica (formato HH:MM) se encuentra dentro de un rango de horario definido.
 * @param hora La hora a verificar.
 * @param horario El rango de horario (inicio y fin, o apertura y cierre).
 * @returns true si está dentro del horario, de lo contrario false.
 */
function dentroDeHorario(hora: string, horario?: { inicio?: string; fin?: string; apertura?: string; cierre?: string }): boolean {
    if (!horario) return false

    const inicio = horario.inicio || horario.apertura
    const fin = horario.fin || horario.cierre

    if (!inicio || !fin) return false

    return hora >= inicio && hora < fin
}

// ============================================================================
// Helper: Check if time overlaps with lunch block
// ============================================================================
/**
 * Evalúa si un bloque de cita se superpone con la hora de almuerzo programada.
 * @param horaInicio Hora de inicio de la cita.
 * @param horaFin Hora de fin de la cita.
 * @param bloqueo Rango del bloque de almuerzo.
 * @returns true si hay solapamiento, false si está libre.
 */
function dentroDeBloqueAlmuerzo(horaInicio: string, horaFin: string, bloqueo: BloqueAlmuerzo): boolean {
    // Check if the appointment time range overlaps with lunch block
    return !(horaFin <= bloqueo.inicio || horaInicio >= bloqueo.fin)
}

// ============================================================================
// Helper: Check if two time ranges overlap
// ============================================================================
/**
 * Verifica si existe un solapamiento (overlap) entre dos rangos de fechas/horas.
 * @param inicio1 Inicio del primer rango.
 * @param fin1 Fin del primer rango.
 * @param inicio2 Inicio del segundo rango.
 * @param fin2 Fin del segundo rango.
 * @returns true si los horarios chocan.
 */
function hayOverlap(inicio1: Date, fin1: Date, inicio2: Date, fin2: Date): boolean {
    return inicio1 < fin2 && fin1 > inicio2
}

// ============================================================================
// Main Validation Function - Triple Cascade
// ============================================================================
/**
 * Realiza una validación en cascada de 4 niveles para determinar si una cita puede ser agendada.
 * Nivel 1: Horario de la sucursal.
 * Nivel 2: Horario de trabajo y descansos del barbero.
 * Nivel 3: Citas existentes (prevención de solapamientos).
 * Nivel 4: Bloqueos manuales (vacaciones, emergencias).
 * @param sucursalId ID de la sucursal.
 * @param barberoId ID del barbero.
 * @param timestampInicio Fecha y hora en la que inicia la cita.
 * @param duracionMinutos Duración estimada de la cita en minutos.
 * @returns Un objeto ValidacionResultado indicando si es válido y la razón si no lo es.
 */
export async function validarDisponibilidad(
    sucursalId: string,
    barberoId: string,
    timestampInicio: Date,
    duracionMinutos: number
): Promise<ValidacionResultado> {
    const supabase = createClient()
    const timestampFin = new Date(timestampInicio.getTime() + duracionMinutos * 60000)

    const diaSemana = getDiaSemana(timestampInicio)
    const horaInicio = timestampInicio.toTimeString().slice(0, 5)
    const horaFin = timestampFin.toTimeString().slice(0, 5)

    // ========================================================================
    // LEVEL 1: Validate branch hours
    // ========================================================================
    const { data: sucursal, error: sucursalError } = await (supabase
        .from('sucursales') as any)
        .select('horario_apertura, activa')
        .eq('id', sucursalId)
        .single() as { data: { horario_apertura: any; activa: boolean } | null; error: any }

    if (sucursalError || !sucursal) {
        return { valido: false, mensaje: 'Sucursal no encontrada' }
    }

    if (!sucursal.activa) {
        return { valido: false, mensaje: 'La sucursal no está activa' }
    }

    const horarioSucursal = sucursal.horario_apertura as HorarioApertura
    const horarioDia = horarioSucursal[diaSemana]

    if (!horarioDia) {
        return { valido: false, mensaje: `La sucursal no abre los ${diaSemana}` }
    }

    if (!dentroDeHorario(horaInicio, horarioDia) || !dentroDeHorario(horaFin, horarioDia)) {
        return {
            valido: false,
            mensaje: `Fuera del horario de la sucursal (${horarioDia.apertura} - ${horarioDia.cierre})`
        }
    }

    // ========================================================================
    // LEVEL 2: Validate barber schedule
    // ========================================================================
    const { data: barbero, error: barberoError } = await (supabase
        .from('barberos') as any)
        .select('horario_laboral, bloqueo_almuerzo, activo, nombre')
        .eq('id', barberoId)
        .single() as { data: { horario_laboral: any; bloqueo_almuerzo: any; activo: boolean; nombre: string } | null; error: any }

    if (barberoError || !barbero) {
        return { valido: false, mensaje: 'Barbero no encontrado' }
    }

    if (!barbero.activo) {
        return { valido: false, mensaje: 'El barbero no está activo' }
    }

    const horarioBarbero = barbero.horario_laboral as HorarioLaboralSemana
    const horarioLaboralDia = horarioBarbero[diaSemana]

    if (!horarioLaboralDia) {
        return { valido: false, mensaje: `${barbero.nombre} no trabaja los ${diaSemana}` }
    }

    if (!dentroDeHorario(horaInicio, horarioLaboralDia)) {
        return {
            valido: false,
            mensaje: `${barbero.nombre} trabaja de ${horarioLaboralDia.inicio} a ${horarioLaboralDia.fin}`
        }
    }

    // Check lunch block
    const bloqueoAlmuerzo = barbero.bloqueo_almuerzo as BloqueAlmuerzo | null
    if (bloqueoAlmuerzo && dentroDeBloqueAlmuerzo(horaInicio, horaFin, bloqueoAlmuerzo)) {
        return {
            valido: false,
            mensaje: `${barbero.nombre} está en hora de almuerzo (${bloqueoAlmuerzo.inicio} - ${bloqueoAlmuerzo.fin})`
        }
    }

    // ========================================================================
    // LEVEL 3: Check for overlapping appointments
    // ========================================================================
    const { data: citasExistentes, error: citasError } = await (supabase
        .from('citas') as any)
        .select('timestamp_inicio, timestamp_fin')
        .eq('barbero_id', barberoId)
        .neq('estado', 'cancelada')
        .neq('estado', 'no_show')
        .lt('timestamp_inicio', timestampFin.toISOString())
        .gt('timestamp_fin', timestampInicio.toISOString()) as { data: { timestamp_inicio: string; timestamp_fin: string }[] | null; error: any }

    if (citasError) {
        console.error('Error checking appointments:', citasError)
        return { valido: false, mensaje: 'Error al verificar disponibilidad' }
    }

    const citas = citasExistentes || []
    for (const cita of citas) {
        const citaInicio = new Date(cita.timestamp_inicio)
        const citaFin = new Date(cita.timestamp_fin)

        if (hayOverlap(timestampInicio, timestampFin, citaInicio, citaFin)) {
            return {
                valido: false,
                mensaje: 'Ya hay una cita programada en ese horario'
            }
        }
    }

    // ========================================================================
    // LEVEL 4: Check for active blocks
    // ========================================================================
    const { data: bloqueosActivos, error: bloqueosError } = await (supabase
        .from('bloqueos') as any)
        .select('tipo, motivo')
        .eq('sucursal_id', sucursalId)
        .or(`barbero_id.eq.${barberoId},barbero_id.is.null`)
        .lte('fecha_inicio', timestampFin.toISOString())
        .gte('fecha_fin', timestampInicio.toISOString()) as { data: { tipo: string; motivo: string | null }[] | null; error: any }

    if (bloqueosError) {
        console.error('Error checking blocks:', bloqueosError)
    }

    const bloqueos = bloqueosActivos || []
    if (bloqueos.length > 0) {
        const bloqueo = bloqueos[0]
        const tipoMensaje: Record<string, string> = {
            almuerzo: 'hora de almuerzo',
            vacaciones: 'vacaciones',
            dia_festivo: 'día festivo',
            emergencia: 'emergencia'
        }

        return {
            valido: false,
            mensaje: `No disponible por ${tipoMensaje[bloqueo.tipo] || bloqueo.tipo}${bloqueo.motivo ? `: ${bloqueo.motivo}` : ''}`
        }
    }

    // ========================================================================
    // All validations passed
    // ========================================================================
    return { valido: true }
}

// ============================================================================
// Find next available slots
// ============================================================================
/**
 * Busca espacios disponibles (alternativas) en incrementos de 15 minutos en caso de que 
 * el horario originalmente solicitado no esté disponible.
 * @param sucursalId ID de la sucursal.
 * @param barberoId ID del barbero en cuestión.
 * @param fechaBase Fecha y hora a partir de la cual empezar a buscar.
 * @param duracionMinutos Cuánto tiempo se necesita para la cita.
 * @param cantidad Cuántas alternativas devolver (por defecto 3).
 * @returns Un arreglo de strings (formato ISO) con las horas disponibles.
 */
export async function buscarAlternativas(
    sucursalId: string,
    barberoId: string,
    fechaBase: Date,
    duracionMinutos: number,
    cantidad: number = 3
): Promise<string[]> {
    const alternativas: string[] = []
    const horaActual = new Date(fechaBase)

    // Round to next 15-minute slot
    const minutos = horaActual.getMinutes()
    const siguienteSlot = Math.ceil(minutos / 15) * 15
    horaActual.setMinutes(siguienteSlot, 0, 0)

    let intentos = 0
    const maxIntentos = 48 // Check up to 12 hours (48 x 15min slots)

    while (alternativas.length < cantidad && intentos < maxIntentos) {
        horaActual.setMinutes(horaActual.getMinutes() + 15)
        intentos++

        const resultado = await validarDisponibilidad(
            sucursalId,
            barberoId,
            horaActual,
            duracionMinutos
        )

        if (resultado.valido) {
            alternativas.push(horaActual.toISOString())
        }
    }

    return alternativas
}
