import { DynamicTool } from '@langchain/core/tools'
import { createClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase para el Agente IA (usa service role para bypassear RLS).
 * Todas las tablas operacionales (barberos, citas, servicios, etc.) están en Supabase.
 */
export function getAISupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        console.error('[IA_DIAGNOSTIC] Supabase ENV missing in business.tools!', { url: !!url, key: !!key })
    }
    return createClient(url!, key!)
}

/**
 * Consulta los servicios activos de la sucursal.
 */
export const makeConsultarServiciosTool = (sucursalId: string) => {
    return new DynamicTool({
        name: 'Consultar_Servicios',
        description:
            'Útil para saber qué servicios ofrece la barbería, su duración en minutos y su precio. ' +
            'No recibe parámetros. Devuelve la lista en JSON.',
        func: async () => {
            const supabase = getAISupabaseClient()
            try {
                const { data, error } = await supabase
                    .from('servicios')
                    .select('id, nombre, duracion_minutos, precio')
                    .eq('sucursal_id', sucursalId)
                    .eq('activo', true)
                    .order('nombre')

                if (error) throw error
                if (!data?.length) return JSON.stringify({ message: 'No hay servicios activos.', _databaseInteraction: 'servicios' })
                return JSON.stringify({ servicios: data, _databaseInteraction: 'servicios' })
            } catch (error: any) {
                return `Error al consultar servicios: ${error.message}`
            }
        },
    })
}

/**
 * Consulta los barberos activos de la sucursal.
 */
export const makeConsultarBarberosTool = (sucursalId: string) => {
    return new DynamicTool({
        name: 'Consultar_Barberos',
        description:
            'Útil para saber qué barberos trabajan en la barbería con sus horarios laborales. ' +
            'No recibe parámetros. Devuelve la lista en JSON con id, nombre y horario.',
        func: async () => {
            const supabase = getAISupabaseClient()
            try {
                const { data, error } = await supabase
                    .from('barberos')
                    .select('id, nombre, horario_laboral, bloqueo_almuerzo')
                    .eq('sucursal_id', sucursalId)
                    .eq('activo', true)
                    .order('nombre')

                if (error) throw error
                if (!data?.length) return JSON.stringify({ message: 'No hay barberos activos.', _databaseInteraction: 'barberos' })
                return JSON.stringify({ barberos: data, _databaseInteraction: 'barberos' })
            } catch (error: any) {
                return `Error al consultar barberos: ${error.message}`
            }
        },
    })
}

/**
 * Consulta la información y horarios de la sucursal.
 */
export const makeConsultarSucursalTool = (sucursalId: string) => {
    return new DynamicTool({
        name: 'Consultar_Sucursal',
        description:
            'Devuelve información del negocio: nombre, dirección y horarios de apertura. ' +
            'Útil si el cliente pregunta sobre ubicación u horarios del local.',
        func: async () => {
            const supabase = getAISupabaseClient()
            try {
                const { data, error } = await supabase
                    .from('sucursales')
                    .select('nombre, direccion, telefono_whatsapp, horario_apertura')
                    .eq('id', sucursalId)
                    .single()

                if (error) throw error
                return JSON.stringify({ sucursal: data, _databaseInteraction: 'sucursales' })
            } catch (error: any) {
                return `Error al consultar sucursal: ${error.message}`
            }
        },
    })
}
