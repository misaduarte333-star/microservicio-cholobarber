import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionService } from '@/lib/evolution.service'
import { formatInTimeZone } from 'date-fns-tz'
import { addMinutes, subMinutes } from 'date-fns'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const CRON_SECRET = process.env.CRON_SECRET || 'cholo-secret-cron-2026'

const APP_TIMEZONE = 'America/Hermosillo'

function sanitizePhone(phone: string): string {
    // 1. Limpiar todo lo que no sea número
    let cleaned = phone.replace(/\D/g, '')

    // 2. Si tiene 10 dígitos (Número local de México), agregar 521
    if (cleaned.length === 10) {
        return `521${cleaned}`
    }

    // 3. Caso especial México: si empieza con 52 y tiene 12 dígitos (falta el '1' móvil)
    // Ejemplo: 52 662 278... -> 52 1 662 278...
    if (cleaned.startsWith('52') && cleaned.length === 12) {
        return `521${cleaned.substring(2)}`
    }

    return cleaned
}

export async function GET(req: NextRequest) {
    try {
        // 1. Validar Secret
        const authHeader = req.headers.get('Authorization')
        const searchParams = req.nextUrl.searchParams
        const querySecret = searchParams.get('secret')

        if (authHeader !== `Bearer ${CRON_SECRET}` && querySecret !== CRON_SECRET) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 2. Obtener Configuración Global de Evolution y Sucursales Activas
        const [globalRes, sucursalesRes] = await Promise.all([
            supabase.from('configuracion_ia_global').select('*').eq('id', 1).single(),
            supabase.from('sucursales').select('*').eq('recordatorios_activos', true).eq('activa', true)
        ])

        const globalConfig = globalRes.data
        const sucursalesActivas = sucursalesRes.data || []

        if (!globalConfig?.evolution_api_url || !globalConfig?.evolution_api_key) {
            throw new Error('Falta configuración global de Evolution API')
        }

        const now = new Date()
        const results = {
            sucursales_procesadas: sucursalesActivas.length,
            antes_recordatorio: 0,
            tardanza: 0,
            errores: [] as string[]
        }

        // 3. Iterar por sucursales para procesar sus citas
        for (const suc of sucursalesActivas) {
            const minAntes = suc.minutos_antes_recordatorio || 15
            const minTarde = suc.minutos_tardanza_mensaje || 15

            // Rangos dinámicos (+/- 7.5 minutos de ventana para el cron de 10-15 min)
            const startMin = addMinutes(now, minAntes - 5).toISOString()
            const startMax = addMinutes(now, minAntes + 10).toISOString()

            const endMin = subMinutes(now, minTarde + 10).toISOString()
            const endMax = subMinutes(now, minTarde - 5).toISOString()

            // --- PROCESAR RECORDATORIOS (ANUNCIO/CONFIRMACIÓN) ---
            const { data: citasAntes } = await supabase
                .from('citas')
                .select(`
                    id, cliente_nombre, cliente_telefono, timestamp_inicio,
                    barberos (nombre)
                `)
                .eq('sucursal_id', suc.id)
                .eq('estado', 'confirmada')
                .eq('recordatorio_15m_enviado', false)
                .gt('timestamp_inicio', startMin)
                .lt('timestamp_inicio', startMax)

            if (citasAntes && citasAntes.length > 0) {
                for (const cita of citasAntes) {
                    const barbero = cita.barberos as any
                    const instance = suc.agent_instance_name || suc.evolution_instance || process.env.EVOLUTION_INSTANCE || 'barberia'
                    const apikey = suc.agent_evolution_key || suc.evolution_key || globalConfig.evolution_api_key
                    const label = suc.tipo_prestador_label || 'barbero'
                    
                    const horaLocal = formatInTimeZone(new Date(cita.timestamp_inicio), APP_TIMEZONE, 'h:mm a')
                    const phone = sanitizePhone(cita.cliente_telefono)
                    const message = `Hola ${cita.cliente_nombre}, te recordamos tu cita de hoy a las ${horaLocal} con el ${label} ${barbero.nombre}. ¡Te esperamos!`
                    
                    const sent = await EvolutionService.sendTextMessage(
                        globalConfig.evolution_api_url,
                        apikey,
                        instance,
                        phone,
                        message
                    )

                    if (sent) {
                        await supabase.from('citas').update({ recordatorio_15m_enviado: true }).eq('id', cita.id)
                        results.antes_recordatorio++
                    } else {
                        results.errores.push(`Error recordatorio suc:${suc.slug} a ${cita.cliente_telefono}`)
                    }
                }
            }

            // --- PROCESAR RECORDATORIOS DE TARDANZA ---
            const { data: citasTarde } = await supabase
                .from('citas')
                .select(`
                    id, cliente_nombre, cliente_telefono, timestamp_inicio
                `)
                .eq('sucursal_id', suc.id)
                .eq('estado', 'confirmada')
                .eq('recordatorio_tarde_enviado', false)
                .gt('timestamp_inicio', endMin)
                .lt('timestamp_inicio', endMax)

            if (citasTarde && citasTarde.length > 0) {
                for (const cita of citasTarde) {
                    const instance = suc.agent_instance_name || suc.evolution_instance || process.env.EVOLUTION_INSTANCE || 'barberia'
                    const apikey = suc.agent_evolution_key || suc.evolution_key || globalConfig.evolution_api_key
                    
                    const horaLocal = formatInTimeZone(new Date(cita.timestamp_inicio), APP_TIMEZONE, 'h:mm a')
                    const phone = sanitizePhone(cita.cliente_telefono)
                    const message = `Hola ${cita.cliente_nombre}, ¿vas en camino? Tu cita registrada era a las ${horaLocal}. Si deseas, podemos intentar reagendarla para un espacio disponible más tarde hoy. ¿Deseas que busque un lugar?`
                    
                    const sent = await EvolutionService.sendTextMessage(
                        globalConfig.evolution_api_url,
                        apikey,
                        instance,
                        phone,
                        message
                    )

                    if (sent) {
                        await supabase.from('citas').update({ recordatorio_tarde_enviado: true }).eq('id', cita.id)
                        results.tardanza++
                    } else {
                        results.errores.push(`Error tardanza suc:${suc.slug} a ${cita.cliente_telefono}`)
                    }
                }
            }
        }

        return NextResponse.json({ 
            success: true, 
            timestamp: now.toISOString(),
            results 
        })

    } catch (error: any) {
        console.error('[CRON_REMINDERS] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
