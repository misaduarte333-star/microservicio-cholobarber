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

        const [barberosRes, serviciosRes, sucursalRes, configRes] = await Promise.all([
            supabase.from('barberos').select('id, nombre, horario_laboral, bloqueo_almuerzo, created_at, activo')
                .eq('sucursal_id', sucursalId).eq('activo', true).order('nombre'),
            supabase.from('servicios').select('id, nombre, duracion_minutos, precio, created_at, activo')
                .eq('sucursal_id', sucursalId).eq('activo', true).order('nombre'),
            supabase.from('sucursales').select('nombre, direccion, telefono_whatsapp, horario_apertura, created_at')
                .eq('id', sucursalId).single(),
            supabase.from('configuracion_ia').select('*').eq('sucursal_id', sucursalId).maybeSingle()
        ])

        const ctx = {
            sucursalId,
            timezone: configRes.data?.timezone || 'America/Mexico_City',
            nombre: sucursalRes.data?.nombre || 'Negocio',
            agentName: configRes.data?.agent_name || 'Agente IA',
            personality: configRes.data?.personality || 'Amable',
            customPrompt: configRes.data?.custom_prompt || '',
        }

        const systemPromptStr = buildSystemPrompt({
            nombre: ctx.nombre,
            agentName: ctx.agentName,
            personality: ctx.personality,
            timezone: ctx.timezone,
            customPrompt: ctx.customPrompt || undefined,
            barberos: barberosRes.data || [],
            servicios: serviciosRes.data || [],
            sucursal: sucursalRes.data || undefined
        })

        // Fake variables replacement to show how it looks
        const currentDate = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone })
        const currentTime = new Intl.DateTimeFormat('es-MX', { timeZone: ctx.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())

        const finalSystemPrompt = systemPromptStr
            .replace(/{current_date}/g, currentDate)
            .replace(/{current_time}/g, currentTime)
            .replace(/{sender_phone}/g, '[Teléfono Cliente]')

        // Buscar última fecha (usamos created_at y updated_at si existen)
        let lastUpdatedTimestamp = 0
        if (sucursalRes.data?.created_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(sucursalRes.data.created_at).getTime())
        barberosRes.data?.forEach((b: any) => { if (b.created_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(b.created_at).getTime()) })
        serviciosRes.data?.forEach((s: any) => { if (s.created_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(s.created_at).getTime()) })
        if (configRes.data?.updated_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(configRes.data.updated_at).getTime())

        return NextResponse.json({ 
            prompt: finalSystemPrompt, 
            lastUpdated: lastUpdatedTimestamp > 0 ? new Date(lastUpdatedTimestamp).toISOString() : new Date().toISOString()
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
