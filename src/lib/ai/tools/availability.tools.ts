import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { getAISupabaseClient } from './business.tools'
import { TimeValidator } from './time-validator.tool'
import { toDate, formatInTimeZone } from 'date-fns-tz'
import { addMinutes } from 'date-fns'
import { getSlotDuration, roundDurationTo30MinBlocks } from './slot-duration.helper'

/**
 * Validador de hora stateless.
 * Verifica que la hora esté a 15+ minutos en el futuro (solo aplica para citas de HOY).
 * Para fechas futuras, la hora siempre es válida.
 */
export const makeValidarHoraTool = (sucursalId: string, timezone: string = 'America/Hermosillo') => {
    return new DynamicStructuredTool({
        name: 'VALIDAR_HORA',
        description:
            'HERRAMIENTA OBLIGATORIA (REGLA DE ORO): Llama esta herramienta SIEMPRE que el cliente mencione una hora. ' +
            'No tienes permitido responder sobre disponibilidad ni sugerir horas sin este resultado técnico. ' +
            'Entrada: {"hora_solicitada": "10:00", "fecha": "2026-03-31"}. ',
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
                    return JSON.stringify({ 
                        status: 'error', 
                        message: 'Falta la hora_solicitada', 
                        instruccion_para_agente: 'No puedes validar disponibilidad sin saber la hora. ¡NO asumas que el negocio está cerrado ni respondas cosas como "A esa hora ya cerramos"! Pregúntale al cliente "¿A qué hora te gustaría tu cita?" o usa DISPONIBILIDAD_HOY para ver todo el día.',
                        input_recibido: { hora_solicitada, fecha, slot_inicio } 
                    })
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
                        siguiente_bloque_12h: null,
                        _databaseInteraction: 'Lógica Local'
                    })
                }

                const tz = timezone || 'America/Hermosillo'
                const formatter = new Intl.DateTimeFormat('es-MX', {
                    timeZone: tz,
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: false,
                    hourCycle: 'h23'
                })
                let hora_actual = formatter.format(new Date())
                
                // Fallback: si la hora no tiene formato HH:mm, usar el timezone del sistema
                if (!hora_actual.includes(':')) {
                    const fallbackFormatter = new Intl.DateTimeFormat('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    })
                    hora_actual = fallbackFormatter.format(new Date())
                }
                
                // Debug: log what we're comparing
                console.log('[VALIDAR_HORA] timezone:', tz, 'hora_actual:', hora_actual, 'hora_solicitada:', hora, 'parsed:', TimeValidator.parseHoraPublic(hora))
                
                // Intentar obtener horario de la sucursal para mayor precisión
                const supabase = getAISupabaseClient()
                const { data: sucursalData } = await supabase
                    .from('sucursales')
                    .select('horario_apertura')
                    .eq('id', sucursalId) // sucursalId viene del scope de makeValidarHoraTool
                    .single()

                let config = undefined
                if (sucursalData?.horario_apertura) {
                    const dayName = formatInTimeZone(new Date(), tz, 'eeee').toLowerCase()
                    const dayMap: any = {
                        'monday': 'lunes', 'tuesday': 'martes', 'wednesday': 'miercoles',
                        'thursday': 'jueves', 'friday': 'viernes', 'saturday': 'sabado', 'sunday': 'domingo'
                    }
                    const dayKey = dayMap[dayName] || dayName
                    const hS = sucursalData.horario_apertura[dayKey]
                    if (hS) {
                        const inicio = hS.apertura || hS.inicio
                        const fin = hS.cierre || hS.fin
                        if (inicio && fin) {
                            config = {
                                apertura: parseInt(inicio.split(':')[0]),
                                cierre: parseInt(fin.split(':')[0])
                            }
                        }
                    }
                }

                const result = TimeValidator.validate({ hora_actual, hora_solicitada: hora }, config)
                console.log('[VALIDAR_HORA] result:', result)
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

                // Calcular dia de la semana
                const dayOfWeek = formatInTimeZone(dateStart, timezone, 'eeee').toLowerCase()
                const dayMap: any = {
                    'monday': 'lunes', 'tuesday': 'martes', 'wednesday': 'miercoles',
                    'thursday': 'jueves', 'friday': 'viernes', 'saturday': 'sabado', 'sunday': 'domingo'
                }
                const dayName = dayMap[dayOfWeek] || dayOfWeek

                console.log(`[IA_DIAGNOSTIC] Conectando a Supabase para verificar disponibilidad...`)

                const supabase = getAISupabaseClient()

                // 0. Verificar horario de apertura Y configuración de slots ANTES de calcular dateEnd
                const { data: sucursalData } = await supabase
                    .from('sucursales')
                    .select('horario_apertura, slot_booking_mode')
                    .eq('id', sucursalId)
                    .single()

                // Determinar duración del slot según configuración de la sucursal
                const slotBookingMode = (sucursalData?.slot_booking_mode || 'by_service') as 'fixed_30min' | 'fixed_1hour' | 'by_service'
                const slotDurationMinutes = getSlotDuration(slotBookingMode, 30) // 30 min es default para DISPONIBILIDAD
                
                console.log(`[IA_DIAGNOSTIC] Slot booking mode: ${slotBookingMode}, duration: ${slotDurationMinutes} min`)

                // AHORA calcular dateEnd con la duración correcta
                const dateEnd = addMinutes(dateStart, slotDurationMinutes)

                const isoStart = dateStart.toISOString()
                const isoEnd = dateEnd.toISOString()

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

                // 2. Traer todas las citas y bloqueos desde el slot actual hasta el fin del día
                const endOfDay = new Date(dateStart)
                endOfDay.setHours(23, 59, 59, 999)
                const isoEndOfDay = endOfDay.toISOString()

                const { data: citasFuturas } = await supabase
                    .from('citas')
                    .select('barbero_id, timestamp_inicio, timestamp_fin')
                    .eq('sucursal_id', sucursalId)
                    .neq('estado', 'cancelada')
                    .lt('timestamp_inicio', isoEndOfDay)
                    .gt('timestamp_fin', isoStart)

                const { data: bloqueosFuturos } = await supabase
                    .from('bloqueos')
                    .select('barbero_id, fecha_inicio, fecha_fin')
                    .eq('sucursal_id', sucursalId)
                    .lt('fecha_inicio', isoEndOfDay)
                    .gt('fecha_fin', isoStart)

                const isSucursalBlocked = (bloqueosFuturos ?? []).some((b: any) => !b.barbero_id && b.fecha_inicio < isoEnd && b.fecha_fin > isoStart)

                const resultRows = barberos.map((b: any) => {
                    const workingHours = b.horario_laboral?.[dayName]
                    let estado = 'disponible'
                    let motivo = 'Libre'
                    let proximo_turno_libre_a_las = undefined

                    if (isSucursalBlocked) {
                        estado = 'ocupado'
                        motivo = 'Sucursal cerrada/bloqueada'
                    } else if (!workingHours) {
                        estado = 'ocupado'
                        motivo = `No trabaja los ${dayName}s`
                    } else {
                        const slotTime = formatInTimeZone(dateStart, timezone, 'HH:mm')
                        
                        // Filtrar sus propias citas y bloqueos
                        const misCitas = (citasFuturas ?? []).filter((c: any) => c.barbero_id === b.id)
                        const misBloqueos = (bloqueosFuturos ?? []).filter((bl: any) => bl.barbero_id === b.id)

                        const checkCollision = (start: Date, end: Date, hhmm: string) => {
                            const s = start.toISOString()
                            const e = end.toISOString()
                            // fuera de turno
                            if (hhmm < workingHours.inicio || hhmm >= workingHours.fin) return true
                            // almuerzo
                            if (b.bloqueo_almuerzo && hhmm >= b.bloqueo_almuerzo.inicio && hhmm < b.bloqueo_almuerzo.fin) return true
                            // citas
                            if (misCitas.some((c: any) => c.timestamp_inicio < e && c.timestamp_fin > s)) return true
                            // bloqueos
                            if (misBloqueos.some((bl: any) => bl.fecha_inicio < e && bl.fecha_fin > s)) return true
                            return false
                        }

                        // Verificar slot actual
                        if (checkCollision(dateStart, dateEnd, slotTime)) {
                            estado = 'ocupado'
                            
                            if (slotTime < workingHours.inicio || slotTime >= workingHours.fin) {
                                motivo = `Fuera de su turno (${workingHours.inicio} - ${workingHours.fin})`
                            } else if (b.bloqueo_almuerzo && slotTime >= b.bloqueo_almuerzo.inicio && slotTime < b.bloqueo_almuerzo.fin) {
                                motivo = `En descanso/almuerzo (${b.bloqueo_almuerzo.inicio} - ${b.bloqueo_almuerzo.fin})`
                            } else {
                                motivo = 'Cita o bloqueo personal'
                                
                                // Buscar el proximo slot libre en bloques de la duración configurada hasta el fin del turno
                                let nextStart = addMinutes(dateStart, slotDurationMinutes)
                                let nextEnd = addMinutes(nextStart, slotDurationMinutes)
                                let nextHhmm = formatInTimeZone(nextStart, timezone, 'HH:mm')
                                
                                while (nextHhmm < workingHours.fin) {
                                    if (!checkCollision(nextStart, nextEnd, nextHhmm)) {
                                        // Encontramos un hueco!
                                        // Convertimos a 12h para que el agente lo lea más fácil (opcional, pero útil)
                                        const h = parseInt(nextHhmm.split(':')[0])
                                        const m = nextHhmm.split(':')[1]
                                        const h12 = h % 12 || 12
                                        const ampm = h >= 12 ? 'PM' : 'AM'
                                        proximo_turno_libre_a_las = `${h12}:${m} ${ampm}`
                                        break
                                    }
                                    nextStart = addMinutes(nextStart, slotDurationMinutes)
                                    nextEnd = addMinutes(nextStart, slotDurationMinutes)
                                    nextHhmm = formatInTimeZone(nextStart, timezone, 'HH:mm')
                                }
                            }
                        }
                    }

                    return { id: b.id, nombre: b.nombre, estado, motivo, proximo_turno_libre_a_las }
                })

                return JSON.stringify({
                    slot_revisado: formatInTimeZone(dateStart, timezone, 'yyyy-MM-dd HH:mm'),
                    dia: dayName,
                    barberos: resultRows,
                    _databaseInteraction: ['sucursales', 'barberos', 'citas', 'bloqueos']
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
        'Usa cuando la fecha es HOY. Devuelve profesionales disponibles/ocupados para un slot de tiempo.',
        timezone
    )

export const makeDisponibilidadOtroDiaTool = (sucursalId: string, timezone: string = 'America/Hermosillo') =>
    makeDisponibilidadBase(
        sucursalId,
        'DISPONIBILIDAD_OTRO_DIA',
        'Usa cuando la fecha NO es hoy. Devuelve profesionales disponibles/ocupados para un slot de tiempo.',
        timezone
    )
