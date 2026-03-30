import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AgentService } from '@/lib/ai/agent.service'
import { debouncerService } from '@/lib/ai/debouncer.service'


const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Route handler for the Evolution API Webhook.
 * 
 * Flow:
 * 1. Reveice payload (message, instance name).
 * 2. Identify the Branch (Sucursal) associated with that instance name.
 * 3. Retrieve Global AI Settings (OpenAI key, base URL).
 * 4. Run LangChain Agent.
 * 5. Send message back to Evolution API.
 */
export async function POST(req: Request) {
    try {
        const payload = await req.json()

        // Si Evolution nos manda validaciones o payloads incompletos, ignoramos
        if (!payload || !payload.data || !payload.data.key) {
            return NextResponse.json({ received: true })
        }

        // 1. Resolver instancia
        const instanceName = payload.instance
        if (!instanceName) {
            console.warn('[Webhook] No instance name attached.')
            return NextResponse.json({ received: true })
        }

        // 2. Extraer datos del mensaje
        const remoteJid = payload.data.key.remoteJid
        if (!remoteJid || remoteJid.includes('@g.us')) {
            // Ignorar grupos
            return NextResponse.json({ received: true })
        }

        const senderPhone = remoteJid.split('@')[0].split(':')[0]
        const messageType = payload.data.messageType
        
        let messageText = ''
        if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
            messageText = payload.data.message?.conversation || payload.data.message?.extendedTextMessage?.text
        } else if (messageType === 'audioMessage') {
            const base64Audio = payload.data.message?.base64 || payload.data.message?.audioMessage?.base64
            if (base64Audio) {
                const { AudioTranscriberService } = await import('@/lib/ai/audio.service')
                messageText = await AudioTranscriberService.transcribe(base64Audio)
            }
        }

        // Si no hay texto (ej. fotos, audios no transcribibles) lo ignoramos por ahora
        if (!messageText || messageText.trim().length === 0) {
            return NextResponse.json({ received: true })
        }

        // 3. Buscar la configuración en Supabase
        // Primero, la Branch
        const { data: sucursal, error: branchError } = await supabase
            .from('sucursales')
            .select('*')
            .eq('evolution_instance', instanceName)
            .eq('agent_active', true)
            .single()

        if (branchError || !sucursal) {
            console.warn(`[Webhook] Instancia ${instanceName} no configurada o agente inactivo en tabla sucursales.`)
            return NextResponse.json({ received: true })
        }

        // Segundo, la Configuración Global
        const { data: configIa, error: globalError } = await supabase
            .from('configuracion_ia_global')
            .select('*')
            .eq('id', 1)
            .single()

        if (globalError || !configIa || !configIa.evolution_api_url) {
            console.error('[Webhook] Configuración global de IA incompleta (Falta Evolution URL).')
            return NextResponse.json({ received: true })
        }

        const openaiKey = configIa.openai_api_key || process.env.OPENAI_API_KEY || ''
        const anthropicKey = configIa.anthropic_api_key || process.env.ANTHROPIC_API_KEY || ''
        const groqKey = configIa.groq_api_key || process.env.GROQ_API_KEY || ''

        const sessionId = `${sucursal.id}:${senderPhone}`
        const apiBase = configIa.evolution_api_url.endsWith('/') ? configIa.evolution_api_url : `${configIa.evolution_api_url}/`
        const evoToken = sucursal.evolution_key || configIa.evolution_api_key
        const evoEndpoint = `${apiBase}message/sendText/${instanceName}`

        const provider = sucursal.llm_provider || configIa.default_provider || 'openai'
        let aiModel = configIa.openai_model || 'gpt-4o-mini' // default fallback
        
        if (sucursal.llm_model) {
            aiModel = sucursal.llm_model
        } else {
            if (provider === 'anthropic') aiModel = configIa.anthropic_model || 'claude-3-5-sonnet-20240620'
            if (provider === 'groq') aiModel = configIa.groq_model || 'llama-3.1-70b-versatile'
            if (provider === 'openai') aiModel = configIa.openai_model || 'gpt-4o-mini'
        }

        // 4. Empujar al Debouncer (Redis Cache Engine)
        await debouncerService.pushMessage({
            sessionId,
            senderPhone,
            pushName: payload.data.pushName || 'Desconocido',
            text: messageText,
            timestamp: payload.data.messageTimestamp?.toString(),
            remoteJid,
            context: {
                sucursalId: sucursal.id,
                nombre: sucursal.nombre,
                agentName: sucursal.agent_name || 'Asistente',
                personality: sucursal.agent_personality || 'friendly',
                timezone: 'America/Hermosillo',
                customPrompt: sucursal.agent_custom_prompt,
                aiProvider: provider as any,
                aiModel: aiModel,
                openaiKey,
                anthropicKey,
                groqKey,
                // Passing auth variables so the Debouncer can reply async
                ...( { evoToken, evoEndpoint } as any)
            }
        })

        return NextResponse.json({ success: true, debounced: true })

    } catch (error: any) {
        console.error('[Webhook Error]', error.message)
        // Responder 200 siempre para que Evolution no reintente los 500
        return NextResponse.json({ success: false, error: error.message })
    }
}
