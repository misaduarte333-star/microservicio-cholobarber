import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { getAISupabaseClient } from './business.tools'

/**
 * Busca un cliente por teléfono en Supabase. Si no existe, lo crea.
 */
export const makeBuscarOCrearClienteTool = (sucursalId: string) => {
    return new DynamicStructuredTool({
        name: 'BUSCAR_CLIENTE',
        description:
            'Busca o registra un cliente por teléfono. ' +
            'Retorna el cliente_id que necesitarás en AGENDAR_CITA.',
        schema: z.object({
            telefono: z.string().describe('Teléfono del cliente'),
            nombre: z.string().optional().describe('Nombre del cliente (requerido si es nuevo)')
        }),
        func: async ({ telefono, nombre }) => {
            try {
                if (!telefono) return JSON.stringify({ error: 'Se requiere el teléfono.' })

                const supabase = getAISupabaseClient()

                const { data: existing } = await supabase
                    .from('clientes')
                    .select('id, nombre, total_citas, ultima_cita')
                    .eq('telefono', telefono)
                    .limit(1)
                    .maybeSingle()

                if (existing) {
                    return JSON.stringify({ encontrado: true, cliente: existing })
                }

                if (!nombre) {
                    return JSON.stringify({ encontrado: false, mensaje: 'Cliente nuevo. Se necesita nombre para registrarlo.' })
                }

                const { data: nuevo, error } = await supabase
                    .from('clientes')
                    .insert([{ nombre, telefono }])
                    .select('id, nombre')
                    .single()

                if (error) throw error
                return JSON.stringify({ encontrado: false, registrado: true, cliente: nuevo })
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
                const { data, error } = await supabase
                    .from('citas')
                    .select(`
                        id, timestamp_inicio, timestamp_fin, estado, notas, origen,
                        cliente_nombre,
                        barberos(nombre),
                        servicios(nombre)
                    `)
                    .eq('sucursal_id', sucursalId)
                    .eq('cliente_telefono', cliente_telefono)
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
                    estado: c.estado,
                    notas: c.notas
                }))

                return JSON.stringify(flat)
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
            'Agenda una cita. SOLO ejecutar tras confirmar: nombre, barbero, servicio, hora validada y disponibilidad.',
        schema: z.object({
            barbero_id: z.string().describe('UUID del barbero'),
            servicio_id: z.string().describe('UUID del servicio'),
            cliente_id: z.string().describe('UUID del cliente (obtenido con BUSCAR_CLIENTE)'),
            cliente_nombre: z.string().describe('Nombre del cliente'),
            cliente_telefono: z.string().describe('Teléfono del cliente'),
            timestamp_inicio: z.string().describe('Inicio de la cita en ISO 8601 (ej: 2026-03-30T13:00:00)'),
            timestamp_fin: z.string().describe('Fin de la cita en ISO 8601 (ej: 2026-03-30T13:40:00)')
        }),
        func: async ({ barbero_id, servicio_id, cliente_id, cliente_nombre, cliente_telefono, timestamp_inicio, timestamp_fin }) => {
            try {
                if (!barbero_id || !servicio_id || !cliente_id || !cliente_nombre || !cliente_telefono || !timestamp_inicio || !timestamp_fin) {
                    return JSON.stringify({
                        status: 'error',
                        error: 'Faltan campos requeridos',
                        campos_recibidos: { barbero_id, servicio_id, cliente_id, cliente_nombre, cliente_telefono, timestamp_inicio, timestamp_fin },
                        campos_faltantes: [
                            !barbero_id && 'barbero_id',
                            !servicio_id && 'servicio_id',
                            !cliente_id && 'cliente_id',
                            !cliente_nombre && 'cliente_nombre',
                            !cliente_telefono && 'cliente_telefono',
                            !timestamp_inicio && 'timestamp_inicio',
                            !timestamp_fin && 'timestamp_fin',
                        ].filter(Boolean)
                    })
                }

                const supabase = getAISupabaseClient()

                const insertPayload = {
                    sucursal_id: sucursalId,
                    barbero_id,
                    servicio_id,
                    cliente_id,
                    cliente_nombre,
                    cliente_telefono,
                    timestamp_inicio: new Date(timestamp_inicio).toISOString(),
                    timestamp_fin: new Date(timestamp_fin).toISOString(),
                    estado: 'confirmada' as const,
                    origen: 'whatsapp' as const
                }

                const { data, error } = await supabase
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
                    cita: data
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

                const supabase = getAISupabaseClient()
                const { data, error } = await supabase
                    .from('citas')
                    .update({ estado: 'cancelada' })
                    .eq('id', cita_id)
                    .eq('sucursal_id', sucursalId)
                    .eq('cliente_telefono', cliente_telefono)
                    .select('id')

                if (error) throw error
                if (!data?.length) return JSON.stringify({ status: 'error', error: 'No se encontró esa cita o no te pertenece.' })
                return JSON.stringify({ status: 'ok', mensaje: 'Cita cancelada exitosamente.' })
            } catch (error: any) {
                return JSON.stringify({ status: 'error', message: error.message })
            }
        }
    })
}
