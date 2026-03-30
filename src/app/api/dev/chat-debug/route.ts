import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AgentService, AgentContext } from '@/lib/ai/agent.service'

export async function POST(req: Request) {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { message, sucursalId, sessionId = 'TEST_SESSION', senderPhone = '5551234567' } = await req.json()

        if (!message || !sucursalId) {
            return NextResponse.json({ error: 'Mensaje y sucursalId requeridos.' }, { status: 400 })
        }

        const { data: sucursal, error: branchError } = await supabase
            .from('sucursales')
            .select('*')
            .eq('id', sucursalId)
            .single()

        if (branchError || !sucursal) {
            return NextResponse.json({ error: 'Sucursal no encontrada.' }, { status: 404 })
        }

        // Usamos campos del nuevo esquema de sucursales
        const provider = sucursal.llm_provider || 'openai'
        const aiModel = sucursal.llm_model || (provider === 'openai' ? 'gpt-4o-mini' : '')
        const apiKey = sucursal.llm_api_key || (
            provider === 'openai' ? process.env.OPENAI_API_KEY :
            provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
            process.env.GROQ_API_KEY
        )

        if (!apiKey) {
            return NextResponse.json({ error: `No hay una API key configurada para ${provider}.` }, { status: 500 })
        }

        const ctx: AgentContext = {
            sucursalId: sucursal.id,
            nombre: sucursal.nombre,
            agentName: sucursal.agent_name || 'BarberBot',
            personality: sucursal.agent_personality || 'Friendly',
            timezone: 'America/Hermosillo',
            customPrompt: sucursal.agent_custom_prompt,
            aiProvider: provider as any,
            aiModel: aiModel,
            openaiKey: provider === 'openai' ? apiKey : process.env.OPENAI_API_KEY || '',
            anthropicKey: provider === 'anthropic' ? apiKey : process.env.ANTHROPIC_API_KEY || '',
            groqKey: provider === 'groq' ? apiKey : process.env.GROQ_API_KEY || '',
        }

        // Ejecutar Agente sin debouncer directo al Executor
        const result = await AgentService.run(
            `${sucursalId}:${sessionId}`,
            message,
            senderPhone,
            ctx
        )

        return NextResponse.json({ response: result.response, steps: result.steps })

    } catch (e: any) {
        console.error('[API Chat Debug Error]', e.message)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
