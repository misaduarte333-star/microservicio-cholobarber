import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { getAISupabaseClient } from './business.tools'
import { TimeValidator } from './time-validator.tool'
import { toDate, formatInTimeZone } from 'date-fns-tz'
import { addMinutes } from 'date-fns'

/**
 * Validador de hora stateless.
 * Verifica que la hora esté a 15+ minutos en el futuro (solo aplica para citas de HOY).
 * Para fechas futuras, la hora siempre es válida.
 */
export const makeValidarHoraTool = (timezone: string = 'America/Hermosillo') => {
    return new DynamicStructuredTool({
        name: 'VALIDAR_HORA',
        description:
            'Valida si una hora solicitada es válida. Solo aplica restriccion de 15 min si la cita es para HOY. ' +
            'SIEMPRE llamar antes de consultar disponibilidad.',
        schema: z.object({
            hora_solicitada: z.string().optional().describe('Hora solicitada (ej: "14:30", "3pm", "15:00")'),
            fecha: z.string().optional().describe('Fecha en formato YYYY-MM-DD (ej: "2026-03-30")'),
            slot_inicio: z.string().optional().describe('Alternativa: fecha y hora en ISO (ej: "2026-03-30T13:00:00")')
        }),
        func: async ({ hora_solicitada, fecha, slot_inicio }) => {
            try {
                let hora = hora_solicitada || ''
                let fechaStr = fecha || ''

                // Si viene slot_inicio ISO, extraer fecha y hora de ahi
                if (slot_inicio && slot_inicio.includes('T')) {
                    const [datePart, timePart] = slot_inicio.split('T')
                    if (!fechaStr) fechaStr = datePart
                    if (!hora) hora = timePart.replace(/:00$/, '')
                }

                // Si hora tiene formato ISO (2026-03-30T12:00:00), extraer fecha y hora
                if (hora.includes('T') && hora.includes('-')) {
                    const [datePart, timePart] = hora.split('T')
                    fechaStr = datePart
                    hora = timePart.replace(/:00$/, '')
                }

                if (!hora) {
                    return JSON.stringify({ status: 'error', message: 'Se requiere hora_solicitada y fecha', input_recibido: { hora_solicitada, fecha, slot_inicio } })
                }

                const todayStr = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd')
                if (!fechaStr) fechaStr = todayStr

                // Si la fecha es futura (no hoy), la hora siempre es válida
                if (fechaStr > todayStr) {
                    const p = TimeValidator.parseHoraPublic(hora)
                    const r = TimeValidator.redondearPublic(p.h, p.m)
                    return JSON.stringify({
                        status: 'VALIDA',
                        motivo: 'ok',
                        advertencia: false,
                        hora_solicitada_24h: `${r.h.toString().padStart(2, '0')}:${r.m.toString().padStart(2, '0')}`,
                        siguiente_bloque: null,
                        siguiente_bloque_12h: null
                    })
                }

                const formatter = new Intl.DateTimeFormat('es-MX', {
                    timeZone: timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                })
                const hora_actual = formatter.format(new Date())
                const result = TimeValidator.validate({ hora_actual, hora_solicitada: hora })
                return JSON.stringify(result)
            } catch (error: any) {
                return JSON.stringify({ status: 'error', message: error.message })
            }
        }
    })
}

/**
 * Lógica compartida de disponibilidad para hoy y otro día.
 */
function makeDisponibilidadBase(sucursalId: string, toolName: string, description: string, timezone: string = 'America/Hermosillo') {
    return new DynamicStructuredTool({
        name: toolName,
        description,
        schema: z.object({
            fecha: z.string().optional().describe('Fecha YYYY-MM-DD (ej: "2026-03-30")'),
            hora: z.string().optional().describe('Hora HH:mm (ej: "14:30")'),
            slot_inicio: z.string().optional().describe('Alternativa: fecha y hora en ISO (ej: "2026-03-30T14:30:00")'),
            fecha_hora: z.string().optional().describe('Alternativa: fecha y hora en ISO (ej: "2026-03-30T14:30:00")')
        }),
        func: async ({ fecha, hora, slot_inicio, fecha_hora }) => {
            try {
                // Resolver fecha y hora desde cualquier formato que mande el LLM
                let resolvedFecha = fecha
                let resolvedHora = hora

                const isoInput = slot_inicio || fecha_hora
                if (isoInput && isoInput.includes('T')) {
                    const [datePart, timePart] = isoInput.split('T')
                    if (!resolvedFecha) resolvedFecha = datePart
                    if (!resolvedHora) resolvedHora = timePart.replace(/:00$/, '')
                } else if (isoInput && !resolvedFecha) {
                    // Podria ser solo hora "14:30"
                    resolvedHora = isoInput
                }

                if (!resolvedFecha || !resolvedHora) {
                    return JSON.stringify({ error: 'Se requiere fecha y hora. Usa { "fecha": "YYYY-MM-DD", "hora": "HH:mm" } o { "slot_inicio": "YYYY-MM-DDTHH:mm:00" }', input_recibido: { fecha, hora, slot_inicio, fecha_hora } })
                }

                // Normalizar hora con leading zero
                let timePart = resolvedHora.trim()
                if (timePart.match(/^\d:\d{2}$/)) {
                    timePart = `0${timePart}`
                }
                if (!timePart.includes(':')) {
                    timePart = `${timePart}:00`
                }
                // Quitar segundos extra si vienen
                if (timePart.split(':').length > 2) {
                    timePart = timePart.split(':').slice(0, 2).join(':')
                }

                const normalizedInput = `${resolvedFecha}T${timePart}:00`

                console.log(`[IA_DIAGNOSTIC] Slot: ${resolvedFecha} ${resolvedHora} -> Normalized: ${normalizedInput} (TZ: ${timezone})`)

                const dateStart = toDate(normalizedInput, { timeZone: timezone })

                if (isNaN(dateStart.getTime())) {
                    console.error(`[IA_DIAGNOSTIC] Invalid Date for input: ${normalizedInput}`)
                    return JSON.stringify({ error: 'Formato de fecha/hora inválido', input_recibido: { fecha, hora } })
                }

                const dateEnd = addMinutes(dateStart, 30)

                const isoStart = dateStart.toISOString()
                const isoEnd = dateEnd.toISOString()

                // Calcular dia de la semana
                const dayOfWeek = formatInTimeZone(dateStart, timezone, 'eeee').toLowerCase()
                const dayMap: any = {
                    'monday': 'lunes', 'tuesday': 'martes', 'wednesday': 'miercoles',
                    'thursday': 'jueves', 'friday': 'viernes', 'saturday': 'sabado', 'sunday': 'domingo'
                }
                const dayName = dayMap[dayOfWeek] || dayOfWeek

                console.log(`[IA_DIAGNOSTIC] Conectando a Supabase para verificar disponibilidad...`)

                const supabase = getAISupabaseClient()

                // 0. Verificar horario de apertura de la sucursal
                const { data: sucursalData } = await supabase
                    .from('sucursales')
                    .select('horario_apertura')
                    .eq('id', sucursalId)
                    .single()

                if (sucursalData?.horario_apertura) {
                    const horarioSucursal = sucursalData.horario_apertura[dayName] as { inicio: string; fin: string } | undefined
                    const slotTime = formatInTimeZone(dateStart, timezone, 'HH:mm')

                    if (!horarioSucursal) {
                        return JSON.stringify({
                            sucursal_cerrada: true,
                            slot_revisado: formatInTimeZone(dateStart, timezone, 'yyyy-MM-dd HH:mm'),
                            dia: dayName,
                            motivo: `La sucursal no abre los ${dayName}s`,
                            horario_apertura: sucursalData.horario_apertura,
                            barberos: []
                        })
                    }

                    if (slotTime < horarioSucursal.inicio || slotTime >= horarioSucursal.fin) {
                        return JSON.stringify({
                            sucursal_cerrada: true,
                            slot_revisado: formatInTimeZone(dateStart, timezone, 'yyyy-MM-dd HH:mm'),
                            dia: dayName,
                            motivo: `Fuera del horario de la sucursal (${horarioSucursal.inicio} - ${horarioSucursal.fin})`,
                            horario_sucursal: horarioSucursal,
                            barberos: []
                        })
                    }
                }

                // 1. Barberos activos
                const { data: barberos, error: bError } = await supabase
                    .from('barberos')
                    .select('id, nombre, horario_laboral, bloqueo_almuerzo')
                    .eq('sucursal_id', sucursalId)
                    .eq('activo', true)

                if (bError || !barberos) {
                    console.error('[IA_DIAGNOSTIC] Error en query de barberos:', bError)
                    return JSON.stringify({ error: 'Error al consultar barberos' })
                }

                // 2. Citas que se solapan
                const { data: citasBusy } = await supabase
                    .from('citas')
                    .select('barbero_id')
                    .eq('sucursal_id', sucursalId)
                    .neq('estado', 'cancelada')
                    .lt('timestamp_inicio', isoEnd)
                    .gt('timestamp_fin', isoStart)

                // 3. Bloqueos que se solapan
                const { data: bloqueosBusy } = await supabase
                    .from('bloqueos')
                    .select('barbero_id')
                    .eq('sucursal_id', sucursalId)
                    .lt('fecha_inicio', isoEnd)
                    .gt('fecha_fin', isoStart)

                const isSucursalBlocked = (bloqueosBusy ?? []).some((b: any) => !b.barbero_id)

                const busyIds = new Set<string>([
                    ...(citasBusy ?? []).map((r: any) => r.barbero_id),
                    ...(bloqueosBusy ?? []).map((r: any) => r.barbero_id).filter(Boolean),
                ])

                const resultRows = barberos.map((b: any) => {
                    const workingHours = b.horario_laboral?.[dayName]
                    let estado = 'disponible'
                    let motivo = 'Libre'

                    if (isSucursalBlocked) {
                        estado = 'ocupado'
                        motivo = 'Sucursal cerrada/bloqueada'
                    } else if (!workingHours) {
                        estado = 'ocupado'
                        motivo = `No trabaja los ${dayName}s`
                    } else {
                        const slotTime = formatInTimeZone(dateStart, timezone, 'HH:mm')
                        if (slotTime < workingHours.inicio || slotTime >= workingHours.fin) {
                            estado = 'ocupado'
                            motivo = `Fuera de su turno (${workingHours.inicio} - ${workingHours.fin})`
                        } else if (b.bloqueo_almuerzo && slotTime >= b.bloqueo_almuerzo.inicio && slotTime < b.bloqueo_almuerzo.fin) {
                            estado = 'ocupado'
                            motivo = `En descanso/almuerzo (${b.bloqueo_almuerzo.inicio} - ${b.bloqueo_almuerzo.fin})`
                        } else if (busyIds.has(b.id)) {
                            estado = 'ocupado'
                            motivo = 'Cita o bloqueo personal'
                        }
                    }

                    return { id: b.id, nombre: b.nombre, estado, motivo }
                })

                return JSON.stringify({
                    slot_revisado: formatInTimeZone(dateStart, timezone, 'yyyy-MM-dd HH:mm'),
                    dia: dayName,
                    barberos: resultRows
                })
            } catch (error: any) {
                console.error('[IA_DIAGNOSTIC] CRITICAL_TOOL_ERROR:', error.message)
                return JSON.stringify({
                    status: 'error_tecnico_db',
                    message: error.message,
                    stack: error.stack?.substring(0, 100)
                })
            }
        }
    })
}

export const makeDisponibilidadHoyTool = (sucursalId: string, timezone: string = 'America/Hermosillo') =>
    makeDisponibilidadBase(
        sucursalId,
        'DISPONIBILIDAD_HOY',
        'Usa cuando la fecha es HOY. Devuelve barberos disponibles/ocupados para un slot de tiempo.',
        timezone
    )

export const makeDisponibilidadOtroDiaTool = (sucursalId: string, timezone: string = 'America/Hermosillo') =>
    makeDisponibilidadBase(
        sucursalId,
        'DISPONIBILIDAD_OTRO_DIA',
        'Usa cuando la fecha NO es hoy. Devuelve barberos disponibles/ocupados para un slot de tiempo.',
        timezone
    )
