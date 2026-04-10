import { NextResponse } from 'next/server'
import { getAISupabaseClient } from '@/lib/ai/tools/business.tools'
import { buildSystemPrompt } from '@/lib/ai/prompts'

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const sucursalId = searchParams.get('sucursalId')

    if (!sucursalId) {
        return NextResponse.json({ error: 'Sucursal ID required' }, { status: 400 })
    }

    try {
        const supabase = getAISupabaseClient()

        const [barberosRes, serviciosRes, sucursalRes] = await Promise.all([
            supabase.from('barberos').select('id, nombre, horario_laboral, bloqueo_almuerzo, created_at, activo')
                .eq('sucursal_id', sucursalId).eq('activo', true).order('nombre'),
            supabase.from('servicios').select('id, nombre, duracion_minutos, precio, created_at, activo')
                .eq('sucursal_id', sucursalId).eq('activo', true).order('nombre'),
            supabase.from('sucursales').select('*')
                .eq('id', sucursalId).single()
        ])

        const ctx = {
            sucursalId,
            timezone: 'America/Hermosillo', // Defaulting for now as per production webhook
            nombre: sucursalRes.data?.nombre || 'Negocio',
            agentName: sucursalRes.data?.agent_name || 'Agente IA',
            personality: sucursalRes.data?.agent_personality || 'Amable',
            customPrompt: sucursalRes.data?.agent_custom_prompt || '',
        }

        // Construir catálogo inline para preview del panel admin (sin Redis, directo desde DB)
        const servicios = serviciosRes.data || []
        const barberos = barberosRes.data || []
        let businessCatalog = `═══════════════════════════════════════════\nCATÁLOGO DEL NEGOCIO (PRE-CARGADO)\n═══════════════════════════════════════════\n[SERVICIOS DISPONIBLES]\n`
        servicios.forEach((s: any) => {
            const precio = s.precio ? `$${s.precio}` : 'Precio variable'
            businessCatalog += `- ${s.nombre} | Duración: ${s.duracion_minutos} min | Precio: ${precio} | (Servicio_ID: ${s.id})\n`
        })
        businessCatalog += `\n[BARBEROS DISPONIBLES]\n`
        barberos.forEach((b: any) => {
            businessCatalog += `- ${b.nombre} | (Barbero_ID: ${b.id})\n`
        })

        const systemPromptStr = buildSystemPrompt({
            nombre: ctx.nombre,
            agentName: ctx.agentName,
            personality: ctx.personality,
            timezone: ctx.timezone,
            customPrompt: ctx.customPrompt || undefined,
            businessCatalog
        })

        // Reemplazar variables de runtime para previsualización
        const currentDate = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone })
        const currentTime = new Intl.DateTimeFormat('es-MX', { timeZone: ctx.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())

        const finalSystemPrompt = systemPromptStr
            .replace(/{current_date}/g, currentDate)
            .replace(/{current_time}/g, currentTime)
            .replace(/{sender_phone}/g, '[Teléfono Cliente]')

        // Buscar última fecha de actualización
        let lastUpdatedTimestamp = 0
        if (sucursalRes.data?.created_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(sucursalRes.data.created_at).getTime())
        barberosRes.data?.forEach((b: any) => { if (b.created_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(b.created_at).getTime()) })
        serviciosRes.data?.forEach((s: any) => { if (s.created_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(s.created_at).getTime()) })
        if (sucursalRes.data?.updated_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(sucursalRes.data.updated_at).getTime())

        return NextResponse.json({ 
            prompt: finalSystemPrompt, 
            lastUpdated: lastUpdatedTimestamp > 0 ? new Date(lastUpdatedTimestamp).toISOString() : new Date().toISOString()
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
