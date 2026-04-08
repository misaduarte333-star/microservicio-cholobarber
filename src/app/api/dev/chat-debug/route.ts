import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AgentService, AgentContext } from '@/lib/ai/agent.service'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        
        // Handle save conversation action
        if (body.action === 'save') {
            return handleSaveConversation(body, req)
        }
        
        // Handle chat message (existing logic)
        return handleChatMessage(body, req)
        
    } catch (e: any) {
        console.error('[API Chat Debug Error]', e.message)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

async function handleSaveConversation(body: any, req: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { sucursalId, messages, steps, sessionName } = body
    
    if (!sucursalId || !messages || !messages.length) {
        return NextResponse.json({ error: 'sucursalId y messages requeridos.' }, { status: 400 })
    }
    
    // Generate session name if not provided
    const name = sessionName || `TEST_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '_')}`
    
    // Save each message as a log entry
    const logsToInsert = messages
        .filter((m: any) => m.role === 'user' || m.role === 'ai')
        .map((m: any) => ({
            sucursal_id: sucursalId,
            session_id: name,
            phone: 'TESTER',
            input_preview: m.role === 'user' ? m.text : null,
            output_preview: m.role === 'ai' ? m.text : null,
            latency_ms: 0,
            tools_used: steps || [],
            error: null,
            source: 'tester',
            session_name: name,
            tester_session: true,
            messages: messages
        }))
    
    const { data, error } = await supabase
        .from('ia_request_logs')
        .insert(logsToInsert)
        .select()
    
    if (error) {
        console.error('[Save Error]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, sessionName: name, savedCount: data?.length || 0 })
}

async function handleChatMessage(body: any, req: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { message, sucursalId, sessionId = 'TEST_SESSION', senderPhone = '5551234567' } = body

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

    const result = await AgentService.run(
        `${sucursalId}:${sessionId}`,
        message,
        senderPhone,
        ctx
    )

    return NextResponse.json({ 
        response: result.response, 
        steps: result.steps, 
        systemPrompt: result.systemPrompt,
        promptUpdatedAt: result.promptUpdatedAt
    })
}
