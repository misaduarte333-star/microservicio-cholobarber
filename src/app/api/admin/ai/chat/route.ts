import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AgentService } from '@/lib/ai/agent.service'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
    try {
        const { message, sucursalId, sessionId } = await req.json()

        if (!message || !sucursalId || !sessionId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }

        // 1. Fetch AI Config for this sucursal
        const { data: sucursal, error: sucError } = await supabase
            .from('sucursales')
            .select('*')
            .eq('id', sucursalId)
            .single()

        if (sucError || !sucursal) throw new Error('Sucursal not found')

        const provider = sucursal.llm_provider || 'openai'
        const aiModel = sucursal.llm_model || (provider === 'openai' ? 'gpt-4o-mini' : '')
        const apiKey = sucursal.llm_api_key || (
            provider === 'openai' ? process.env.OPENAI_API_KEY :
            provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
            process.env.GROQ_API_KEY
        )

        const ctx: any = {
            sucursalId: sucursal.id,
            nombre: sucursal.nombre,
            agentName: sucursal.agent_name || 'Asistente',
            personality: sucursal.agent_personality || 'friendly',
            timezone: 'America/Hermosillo',
            customPrompt: sucursal.agent_custom_prompt,
            aiProvider: provider as any,
            aiModel: aiModel,
            openaiKey: provider === 'openai' ? apiKey : process.env.OPENAI_API_KEY || '',
            anthropicKey: provider === 'anthropic' ? apiKey : process.env.ANTHROPIC_API_KEY || '',
            groqKey: provider === 'groq' ? apiKey : process.env.GROQ_API_KEY || '',
        }

        // 2. Run the agent directly
        const result = await AgentService.run(sessionId, message, 'DEBUG_USER', ctx)

        return NextResponse.json({ 
            response: result.response, 
            steps: result.steps 
        })

    } catch (error: any) {
        console.error('[Chat Debug Error]', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
