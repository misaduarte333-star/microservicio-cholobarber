import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AgentService, AgentContext } from '@/lib/ai/agent.service'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
    try {
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

        const { data: configIa, error: globalError } = await supabase
            .from('configuracion_ia_global')
            .select('*')
            .eq('id', 1)
            .single()

        // configIa puede no existir aún — usamos env vars como fallback
        const openaiKey = configIa?.openai_api_key || process.env.OPENAI_API_KEY || ''
        const anthropicKey = configIa?.anthropic_api_key || process.env.ANTHROPIC_API_KEY || ''
        const groqKey = configIa?.groq_api_key || process.env.GROQ_API_KEY || ''

        if (!openaiKey && !anthropicKey && !groqKey) {
            return NextResponse.json({ error: 'No hay ninguna API key configurada (ni en BD ni en .env).' }, { status: 500 })
        }

        const provider = sucursal.agent_provider || configIa?.default_provider || 'openai'
        let aiModel = configIa?.openai_model || 'gpt-4o-mini'
        
        if (sucursal.agent_model) {
            aiModel = sucursal.agent_model
        } else {
            if (provider === 'anthropic') aiModel = configIa?.anthropic_model || 'claude-3-5-sonnet-20240620'
            if (provider === 'groq') aiModel = configIa?.groq_model || 'llama-3.1-70b-versatile'
            if (provider === 'openai') aiModel = configIa?.openai_model || 'gpt-4o-mini'
        }

        const ctx: AgentContext = {
            sucursalId: sucursal.id,
            nombre: sucursal.nombre,
            agentName: sucursal.agent_name || 'BarberBot',
            personality: sucursal.agent_personality || 'Friendly',
            timezone: 'America/Hermosillo',
            customPrompt: sucursal.agent_prompt_override,
            aiProvider: provider as any,
            aiModel: aiModel,
            openaiKey,
            anthropicKey,
            groqKey,
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
