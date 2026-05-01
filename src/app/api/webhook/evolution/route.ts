import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AgentService } from '@/lib/ai/agent.service'
import { debouncerService, redis } from '@/lib/ai/debouncer.service'
import { EvolutionService } from '@/lib/evolution.service'


const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CHOLO_BARBER_ID = 'f07a7640-9d86-499f-a048-24109345787a'

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
        console.info(`[Webhook] Incoming request: ${req.method} ${req.url}`)
        const payload = await req.json()
        console.dir(payload, { depth: null })

        // Si Evolution nos manda validaciones o payloads incompletos, ignoramos
        if (!payload || !payload.data || !payload.data.key) {
            console.warn('[Webhook] Incomplete payload received.')
            return NextResponse.json({ received: true })
        }

        // 1. Resolver instancia
        const rawInstanceName = payload.instance
        if (!rawInstanceName) {
            console.warn('[Webhook] No instance name attached in payload:', JSON.stringify(payload).substring(0, 200))
            return NextResponse.json({ received: true })
        }
        const instanceName = rawInstanceName.toLowerCase()
        console.info(`[Webhook] Processing event for instance: "${rawInstanceName}" (normalized: "${instanceName}")`)

        // 2. Extraer datos del mensaje
        const remoteJid = payload.data.key.remoteJid
        if (!remoteJid || remoteJid.includes('@g.us')) {
            console.info(`[Webhook] Ignoring group message from ${remoteJid}`)
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
            // Pero si es un mensaje de salida (del barbero) sin texto, igual queremos pausar
            if (!payload.data.key.fromMe) return NextResponse.json({ received: true })
        }

        const isFromMe = !!payload.data.key.fromMe
        const cleanMessageText = messageText.toLowerCase().trim()

        // 3. Buscar la configuración en Supabase
        let sucursal: any = null

        // --- LÓGICA DE RUTEO POR INSTANCIA ---
        if (instanceName === 'cholobarber' || instanceName === 'cholobarber_v2' || instanceName === 'cholo_barber' || instanceName === 'cholobrbr') {
            // Instancia EXCLUSIVA de producción: Cholo Barber
            const { data } = await supabase.from('sucursales').select('*').eq('id', CHOLO_BARBER_ID).single()
            sucursal = data
        } 
        else if (instanceName === 'barberia' || instanceName === 'pruebas') {
            // Instancia de PRUEBAS multi-negocio
            if (cleanMessageText === 'reiniciar pruebas' || cleanMessageText === '/reset') {
                const currentTestBranch = await debouncerService.getTestBranch(senderPhone)
                if (currentTestBranch) {
                    // Limpieza profunda: Redis + Historial de Postgres
                    await debouncerService.clearSession(senderPhone, currentTestBranch, senderPhone)
                }
                await debouncerService.setTestBranch(senderPhone, null)
                await EvolutionService.sendTextMessage(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, instanceName, remoteJid, '🔄 Pruebas reiniciadas. Historial borrado.\n\nEnvía cualquier mensaje para elegir negocio.')
                return NextResponse.json({ received: true, action: 'test_reset' })
            }

            const selectedId = await debouncerService.getTestBranch(senderPhone)
            if (selectedId) {
                const { data } = await supabase.from('sucursales')
                    .select('*')
                    .eq('id', selectedId)
                    .eq('agent_enabled', true)
                    .single()
                sucursal = data
            }

            if (!sucursal) {
                // No hay selección o el ID ya no es válido -> Listar negocios
                const { data: sucursales } = await supabase.from('sucursales')
                    .select('id, nombre')
                    .eq('agent_enabled', true)
                    .neq('nombre', 'Pruebas') // No mostrar el negocio comodín de pruebas
                    .neq('agent_instance_name', 'pruebas')
                
                // Verificar si el mensaje del usuario coincide con algún nombre de negocio
                const match = sucursales?.find(s => cleanMessageText.includes(s.nombre.toLowerCase()))
                if (match) {
                    await debouncerService.setTestBranch(senderPhone, match.id)
                    const { data } = await supabase.from('sucursales').select('*').eq('id', match.id).single()
                    sucursal = data
                    await EvolutionService.sendTextMessage(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, instanceName, remoteJid, `✅ Entrando en modo de pruebas para: *${match.nombre}*.\n\nEscribe "Reiniciar pruebas" para cambiar.`)
                } else {
                    const list = sucursales?.map((s, i) => `${i + 1}. *${s.nombre}*`).join('\n') || 'No hay negocios configurados.'
                    // Mostrar escribiendo antes del prompt de selección
                    await EvolutionService.sendPresence(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, instanceName, remoteJid, 'composing')
                    await EvolutionService.sendTextMessage(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, instanceName, remoteJid, `🧪 *MODO DE PRUEBAS*\n\n¿Qué negocio quieres probar hoy?\n\n${list}\n\nEscribe el nombre del negocio para comenzar.`)
                    return NextResponse.json({ received: true, action: 'test_routing_prompt' })
                }
            }
        } 
        else {
            // Instancia estándar: buscar por mapeo en DB (ignorar mayúsculas/minúsculas)
            const { data } = await supabase
                .from('sucursales')
                .select('*')
                .ilike('agent_instance_name', instanceName)
                .eq('agent_enabled', true)
                .single()
            sucursal = data
        }

        if (!sucursal) {
            console.warn(`[Webhook] ERROR: No se encontró sucursal para instancia "${rawInstanceName}". Verifique agent_instance_name en la DB o si el ID hardcodeado es correcto.`)
            // Listar opciones para diagnóstico en logs
            const { data: options } = await supabase.from('sucursales').select('nombre, agent_instance_name').eq('agent_enabled', true)
            console.info('[Webhook] Instancias configuradas en DB:', options?.map(o => `${o.nombre}: ${o.agent_instance_name}`).join(', '))
            return NextResponse.json({ received: true })
        }

        console.info(`[Webhook] Sucursal detectada: ${sucursal.nombre} (ID: ${sucursal.id})`)

        // Definir el nombre real de la instancia para usar en endpoints de Evolution
        // Si estamos en modo pruebas, usamos el nombre del webhook ('pruebas' o 'barberia')
        // Si no, usamos lo que diga la DB para ese negocio
        const targetInstance = (instanceName === 'barberia' || instanceName === 'pruebas') 
            ? rawInstanceName 
            : (sucursal.agent_instance_name || rawInstanceName)


        // --- VALIDACIÓN DE BOT ACTIVO ---
        if (sucursal.agent_active === false) {
            console.info(`[Webhook] Agente IA desactivado globalmente para ${sucursal.nombre}. Ignorando respuesta.`)
            return NextResponse.json({ received: true, action: 'agent_inactive' })
        }

        // --- CONFIGURACIÓN GLOBAL Y CREDENCIALES ---
        const { data: configIa, error: globalError } = await supabase
            .from('configuracion_ia_global')
            .select('*')
            .eq('id', 1)
            .single()

        if (globalError || !configIa || !configIa.evolution_api_url) {
            console.error('[Webhook] Configuración global de IA incompleta (Falta Evolution URL).')
            return NextResponse.json({ received: true })
        }

        const apiBase = configIa.evolution_api_url.endsWith('/') ? configIa.evolution_api_url : `${configIa.evolution_api_url}/`
        const evoToken = sucursal.agent_evolution_key || configIa.evolution_api_key

        // --- LÓGICA DE MODO MANUAL / INTERVENCIÓN ---
        // 1. Si el mensaje lo envió el barbero (fromMe), activar modo manual
        if (isFromMe) {
            // EVITAR AUTO-PAUSA: Verificamos si hay un bloqueo de bot en Redis para este chat
            const botLockKey = `bot_sending:${remoteJid}`
            const isBotMessage = await redis.get(botLockKey)

            if (isBotMessage) {
                console.info(`[Webhook] Mensaje de salida detectado (Confirmado Bot via Redis). No se requiere acción.`)
                // Consumir el bloqueo para no interferir con el siguiente mensaje si ocurre rápido
                await redis.del(botLockKey)
                return NextResponse.json({ received: true })
            }

            // Si la pausa por intervención está habilitada, pausamos por el tiempo configurado
            if (sucursal.intervention_pause_enabled !== false) {
                const duration = sucursal.intervention_pause_duration || 60
                console.info(`[Webhook] Intervención HUMANA detectada en ${instanceName}. Pausando agente para ${senderPhone} por ${duration} minutos.`)
                await debouncerService.setManualMode(sucursal.id, senderPhone, true, duration)
            } else {
                console.info(`[Webhook] Intervención HUMANA detectada en ${instanceName}, pero la pausa automática está deshabilitada.`)
            }
            
            return NextResponse.json({ received: true, mode: 'manual_activated' })
        }

        // 2. Si el barbero quiere reactivar manualmente
        if (cleanMessageText === 'activar' || cleanMessageText === 'activar agente' || cleanMessageText === 'reactivar bot' || cleanMessageText === '/activar') {
            console.info(`[Webhook] Reactivando agente para ${senderPhone} manualmente.`)
            await debouncerService.setManualMode(sucursal.id, senderPhone, false)
            
            return NextResponse.json({ received: true, action: 'agent_reactivated' })
        }

        // 3. Verificar si estamos en modo manual
        const isManual = await debouncerService.getManualMode(sucursal.id, senderPhone)
        if (isManual) {
            console.info(`[Webhook] Agente pausado para ${senderPhone}. Ignorando mensaje.`)
            return NextResponse.json({ received: true, ignored: 'manual_mode_active' })
        }
        // --- FIN LÓGICA MODO MANUAL ---

        // Segundo, la Configuración Global ya fue cargada arriba
        const openaiKey = configIa.openai_api_key || process.env.OPENAI_API_KEY || ''
        const anthropicKey = configIa.anthropic_api_key || process.env.ANTHROPIC_API_KEY || ''
        const groqKey = configIa.groq_api_key || process.env.GROQ_API_KEY || ''

        const sessionId = `${sucursal.id}:${senderPhone}`
        const evoEndpoint = `${apiBase}message/sendText/${targetInstance}`

        console.info(`[Webhook] Processing session ${sessionId} on instance ${targetInstance}`)
        console.info(`[Webhook] Using Token: ${evoToken?.substring(0, 5)}... | Endpoint: ${evoEndpoint}`)

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
                tipoPrestador: sucursal.tipo_prestador || 'barbero',
                tipoPrestadorLabel: sucursal.tipo_prestador_label || 'Barbero',
                aiProvider: provider as any,
                aiModel: aiModel,
                openaiKey,
                anthropicKey,
                groqKey,
                evoToken,
                evoEndpoint,
                apiBase,
                instanceName: targetInstance,
                presenceInstance: instanceName // Forzar presencia en la instancia de origen
            }
        })

        return NextResponse.json({ success: true, debounced: true })

    } catch (error: any) {
        console.error('[Webhook Error]', error.message)
        // Responder 200 siempre para que Evolution no reintente los 500
        return NextResponse.json({ success: false, error: error.message })
    }
}
