import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { toDate, formatInTimeZone } from 'date-fns-tz'
import { getAISupabaseClient } from './business.tools'
import { APP_TIMEZONE } from '../../timezone'

/**
 * Normaliza un número de teléfono de WhatsApp/Evolution API.
 * Principalmente enfocado en México: 521XXXXXXXXXX -> 52XXXXXXXXXX
 */
export const normalizePhone = (phone: string): string => {
    if (!phone) return ''
    let cleaned = phone.replace(/\D/g, '') // Quitar todo lo que no sea número
    
    // Regla para México (Estandarización 521): 
    // Si empieza con 52 y tiene 12 dígitos (ej: 52 662...), añadir el 1 -> 521...
    if (cleaned.startsWith('52') && !cleaned.startsWith('521') && cleaned.length === 12) {
        cleaned = '521' + cleaned.substring(2)
    }

    return cleaned
}

/**
 * Busca un cliente por teléfono en Supabase. Si no existe, lo crea.
 */
export const makeBuscarOCrearClienteTool = (sucursalId: string) => {
    return new DynamicStructuredTool({
        name: 'BUSCAR_CLIENTE',
        description:
            'Verifica si el cliente ya existe por su teléfono. ' +
            'Si devuelve encontrado:true, ya tienes su nombre y cliente_id. ' +
            'Si encontrado:false, es un cliente nuevo; solo pide su nombre si es necesario para agendar.',
        schema: z.object({
            telefono: z.string().describe('Teléfono del cliente'),
            nombre: z.string().optional().describe('Nombre del cliente (requerido si es nuevo)')
        }),
        func: async ({ telefono, nombre }) => {
            try {
                if (!telefono) return JSON.stringify({ error: 'Se requiere el teléfono.' })

                const supabase = getAISupabaseClient()
                const phoneClean = normalizePhone(telefono)

                const { data: existing } = await supabase
                    .from('clientes')
                    .select('id, nombre, total_citas, ultima_cita')
                    .eq('telefono', phoneClean)
                    .limit(1)
                    .maybeSingle()

                if (existing) {
                    return JSON.stringify({ encontrado: true, cliente: existing, _databaseInteraction: 'clientes' })
                }

                if (!nombre) {
                    return JSON.stringify({ 
                        encontrado: false, 
                        mensaje: 'CLIENTE_NUEVO: El cliente no existe en la base de datos.',
                        instruccion_para_agente: 'Cliente nuevo. Puedes seguir respondiendo dudas, pero pide su nombre SOLO cuando el usuario esté listo para agendar la cita.'
                    })
                }

                const { data: nuevo, error } = await supabase
                    .from('clientes')
                    .insert([{ nombre, telefono: phoneClean }])
                    .select('id, nombre')
                    .single()

                if (error) throw error
                return JSON.stringify({ encontrado: false, registrado: true, cliente: nuevo, _databaseInteraction: 'clientes' })
            } catch (error: any) {
                return JSON.stringify({ status: 'error', message: error.message })
            }
        }
    })
}

/**
 * Trae las citas activas del cliente con nombres resueltos.
 */
export const makeMisCitasTool = (sucursalId: string) => {
    return new DynamicStructuredTool({
        name: 'MIS_CITAS',
        description:
            'Trae las citas activas del cliente por su teléfono. ' +
            'Devuelve citas con nombre de barbero y servicio.',
        schema: z.object({
            cliente_telefono: z.string().describe('Teléfono del cliente')
        }),
        func: async ({ cliente_telefono }) => {
            try {
                if (!cliente_telefono) return JSON.stringify({ error: 'Se requiere el teléfono del cliente.' })

                const supabase = getAISupabaseClient()
                const phoneClean = normalizePhone(cliente_telefono)

                const { data, error } = await supabase
                    .from('citas')
                    .select(`
                        id, timestamp_inicio, timestamp_fin, estado, notas, origen,
                        cliente_nombre,
                        barberos(nombre),
                        servicios(nombre)
                    `)
                    .eq('sucursal_id', sucursalId)
                    .eq('cliente_telefono', phoneClean)
                    .not('estado', 'in', '("cancelada","ausente","finalizada")')
                    .order('timestamp_inicio')

                if (error) throw error
                if (!data?.length) return JSON.stringify({ mensaje: 'No tienes citas activas.' })

                const flat = data.map((c: any) => ({
                    id: c.id,
                    barbero: c.barberos ? (c.barberos as any).nombre : 'Sin asignar',
                    servicio: c.servicios ? (c.servicios as any).nombre : 'Servicio eliminado',
                    cliente_nombre: c.cliente_nombre,
                    timestamp_inicio: c.timestamp_inicio,
                    timestamp_fin: c.timestamp_fin,
                    // Añadimos formatos locales para que el agente no se confunda con UTC
                    inicio_local: formatInTimeZone(new Date(c.timestamp_inicio), APP_TIMEZONE, 'yyyy-MM-dd HH:mm'),
                    fin_local: formatInTimeZone(new Date(c.timestamp_fin), APP_TIMEZONE, 'yyyy-MM-dd HH:mm'),
                    estado: c.estado,
                    notas: c.notas
                }))

                return JSON.stringify(flat.map(f => ({ ...f, _databaseInteraction: 'citas' })))
            } catch (error: any) {
                return JSON.stringify({ status: 'error', message: error.message })
            }
        }
    })
}

/**
 * Agenda una cita en Supabase. Incluye upsert de cliente.
 */
export const makeAgendarCitaTool = (sucursalId: string) => {
    return new DynamicStructuredTool({
        name: 'AGENDAR_CITA',
        description:
            'ÚNICA FORMA DE CREAR UNA CITA. Ejecutar SOLO tras confirmar: NOMBRE DEL CLIENTE, barbero, servicio, hora validada y disponibilidad. ' +
            'ESTA HERRAMIENTA ES LA QUE OBLIGA A TENER EL NOMBRE DEL CLIENTE.',
        schema: z.object({
            barbero_id: z.string().describe('UUID del profesional seleccionado (Barbero, Manicurista, Estilista, etc.)'),
            servicio_id: z.string().describe('UUID del servicio (Asegúrate de que coincida con el nombre del servicio acordado con el cliente).'),
            cliente_id: z.string().describe('UUID del cliente (obtenido con BUSCAR_CLIENTE)'),
            cliente_nombre: z.string().describe('Nombre del cliente'),
            cliente_telefono: z.string().describe('Teléfono del cliente'),
            timestamp_inicio: z.string().describe('Inicio de la cita en hora LOCAL de Hermosillo sin offset, formato ISO 8601 (ej: 2026-03-30T13:00:00). NO incluir Z ni +00:00.'),
            timestamp_fin: z.string().describe('Fin de la cita en hora LOCAL de Hermosillo sin offset, formato ISO 8601 (ej: 2026-03-30T13:40:00). NO incluir Z ni +00:00.')
        }),
        func: async ({ barbero_id, servicio_id, cliente_id, cliente_nombre, cliente_telefono, timestamp_inicio, timestamp_fin }) => {
            try {
                // Validación de seguridad para evitar citas anónimas
                const nombresProhibidos = ['desconocido', 'alguien', 'cliente', 'usuario', 'sin nombre', 'n/a', 'anonymous']
                const nombreLimpio = cliente_nombre.toLowerCase().trim()
                
                if (nombresProhibidos.some(p => nombreLimpio === p) || nombreLimpio.length < 2) {
                    return JSON.stringify({
                        status: 'error',
                        error: 'NOMBRE_INVALIDO',
                        instruccion_para_agente: 'El nombre del cliente no es válido o es un marcador de posición. Pídele su nombre real al usuario.'
                    })
                }

                if (!cliente_id || cliente_id.length < 10) {
                     return JSON.stringify({
                        status: 'error',
                        error: 'CLIENTE_ID_INVALIDO',
                        instruccion_para_agente: 'No tienes un ID de cliente válido. Debes llamar primero a BUSCAR_CLIENTE con el nombre del usuario para registrarlo.'
                    })
                }

                if (!barbero_id || !servicio_id || !cliente_id || !cliente_nombre || !cliente_telefono || !timestamp_inicio || !timestamp_fin) {
                    return JSON.stringify({
                        status: 'error',
                        error: 'Faltan campos requeridos para agendar',
                        instruccion_para_agente: '¡ALTO! No agendaste la cita porque te faltan campos. ¡NUNCA le digas al cliente que la cita está lista! Dile qué dato te falta (ej. el servicio, su nombre, con quién quiere agendar, etc) y pregúntaselo.',
                        campos_recibidos: { barbero_id, servicio_id, cliente_id, cliente_nombre, cliente_telefono, timestamp_inicio, timestamp_fin },
                        campos_faltantes: [
                            !barbero_id && 'barbero_id (Pregunta con quién desea agendar)',
                            !servicio_id && 'servicio_id (Pregunta qué servicio desea)',
                            !cliente_id && 'cliente_id (Llama a BUSCAR_CLIENTE)',
                            !cliente_nombre && 'cliente_nombre (Pide su nombre)',
                            !cliente_telefono && 'cliente_telefono',
                            !timestamp_inicio && 'timestamp_inicio',
                            !timestamp_fin && 'timestamp_fin',
                        ].filter(Boolean)
                    })
                }

                const supabase = getAISupabaseClient()

                const phoneClean = normalizePhone(cliente_telefono)

                // Interpretar timestamps como hora local de Hermosillo (UTC-7)
                // new Date(strSinOffset) en Node.js los trataría como UTC, causando error de -7h
                // toDate de date-fns-tz los convierte correctamente a UTC para Supabase
                const stripOffset = (ts: string) => ts.replace(/([+-]\d{2}:\d{2}|Z)$/, '')
                const tsInicio = toDate(stripOffset(timestamp_inicio), { timeZone: APP_TIMEZONE })
                const tsFin    = toDate(stripOffset(timestamp_fin),    { timeZone: APP_TIMEZONE })

                const insertPayload = {
                    sucursal_id: sucursalId,
                    barbero_id,
                    servicio_id,
                    cliente_id,
                    cliente_nombre,
                    cliente_telefono: phoneClean,
                    timestamp_inicio: tsInicio.toISOString(),
                    timestamp_fin: tsFin.toISOString(),
                    estado: 'confirmada' as const,
                    origen: 'whatsapp' as const
                }

                const { data, error: conflictError } = await supabase
                    .from('citas')
                    .select('id, timestamp_inicio, timestamp_fin')
                    .eq('barbero_id', barbero_id)
                    .eq('sucursal_id', sucursalId)
                    .in('estado', ['confirmada', 'pendiente'])
                    .lt('timestamp_inicio', tsFin.toISOString())
                    .gt('timestamp_fin', tsInicio.toISOString())
                    .limit(1)
                    .maybeSingle()

                if (conflictError) throw conflictError

                if (data) {
                    return JSON.stringify({
                        status: 'error',
                        error: 'BARBERO_NO_DISPONIBLE',
                        instruccion_para_agente: 'El barbero ya tiene una cita en ese horario. Llama a DISPONIBILIDAD_HOY para encontrar el siguiente slot libre y ofrécelo al cliente.',
                        slot_ocupado: { inicio: data.timestamp_inicio, fin: data.timestamp_fin }
                    })
                }

                const { data: insertData, error } = await supabase
                    .from('citas')
                    .insert([insertPayload])
                    .select('id, sucursal_id, barbero_id, servicio_id, cliente_id, cliente_nombre, cliente_telefono, timestamp_inicio, timestamp_fin, estado, origen')
                    .single()

                if (error) {
                    if (error.code === '23505' || error.message.includes('unique')) {
                        return JSON.stringify({
                            status: 'error',
                            error_code: 'SLOT_OCUPADO',
                            instruccion_para_agente: 'Ese horario acaba de ser tomado por otra persona. Discúlpate y ofrece buscar otro horario o barbero.',
                            payload_intentado: insertPayload
                        })
                    }
                    return JSON.stringify({
                        status: 'error',
                        error_code: error.code,
                        message: error.message,
                        details: error.details,
                        hint: error.hint,
                        payload_intentado: insertPayload
                    })
                }

                return JSON.stringify({
                    status: 'ok',
                    cita: insertData,
                    _databaseInteraction: 'citas'
                })
            } catch (error: any) {
                return JSON.stringify({ status: 'error', message: error.message, stack: error.stack?.substring(0, 200) })
            }
        }
    })
}

/**
 * Cancela una cita del cliente en Supabase.
 */
export const makeCancelarCitaTool = (sucursalId: string) => {
    return new DynamicStructuredTool({
        name: 'CANCELAR_CITA',
        description:
            'Cancela una cita del cliente. Solo puede cancelar citas del mismo número que escribe. ' +
            'Obtén el cita_id con MIS_CITAS.',
        schema: z.object({
            cita_id: z.string().describe('UUID de la cita a cancelar'),
            cliente_telefono: z.string().describe('Teléfono del cliente dueño de la cita')
        }),
        func: async ({ cita_id, cliente_telefono }) => {
            try {
                if (!cita_id || !cliente_telefono) {
                    return JSON.stringify({ status: 'error', error: 'Se requiere cita_id y cliente_telefono' })
                }

                const phoneClean = normalizePhone(cliente_telefono)
                const supabase = getAISupabaseClient()
                const { data, error } = await supabase
                    .from('citas')
                    .update({ estado: 'cancelada' })
                    .eq('id', cita_id)
                    .eq('sucursal_id', sucursalId)
                    .eq('cliente_telefono', phoneClean)
                    .select('id')

                if (error) throw error
                if (!data?.length) return JSON.stringify({ status: 'error', error: 'No se encontró esa cita o no te pertenece.' })
                return JSON.stringify({ status: 'ok', mensaje: 'Cita cancelada exitosamente.', _databaseInteraction: 'citas' })
            } catch (error: any) {
                return JSON.stringify({ status: 'error', message: error.message })
            }
        }
    })
}
