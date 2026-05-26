import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AgentService } from '@/lib/ai/agent.service'
import { debouncerService, redis } from '@/lib/ai/debouncer.service'
import { EvolutionService } from '@/lib/evolution.service'


const supabase = createClient(
    process.env['SUPABASE_URL'] || process.env['NEXT_PUBLIC_SUPABASE_URL'] || '',
    process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || ''
)

const CHOLO_BARBER_ID = process.env.CHOLO_BARBER_ID || 'f07a7640-9d86-499f-a048-24109345787a'

import { createHmac } from 'crypto'

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
        
        const rawBody = await req.text()
        const secret = process.env.EVOLUTION_WEBHOOK_SECRET

        // 1. Verificación de firma HMAC / API Key (Seguridad Crítica)
        if (secret) {
            const signature = req.headers.get('apikey') || req.headers.get('signature') || req.headers.get('x-hub-signature') || ''
            const hmac = createHmac('sha256', secret).update(rawBody).digest('hex')
            const expectedSig = signature.replace('sha256=', '')

            if (signature !== secret && expectedSig !== hmac) {
                console.warn('[Webhook] 🔴 FIRMA INVÁLIDA. Posible inyección de mensajes rechazada.')
                return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
            }
        }

        let payload: any
        try {
            payload = JSON.parse(rawBody)
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
        }

        if (process.env.NODE_ENV !== 'production') {
            console.dir(payload, { depth: null })
        } else {
            console.info(`[Webhook] Payload recibido - Instance: ${payload?.instance}, Event: ${payload?.event}`)
        }

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
        // El 'remoteJid' es el identificador ESTABLE del chat (mismo para msgs entrantes y salientes).
        // Lo usamos como clave de pausa: garantiza consistencia sin importar LIDs.
        const rawRemoteJid = payload.data.key.remoteJid

        if (!rawRemoteJid || rawRemoteJid.includes('@g.us')) {
            console.info(`[Webhook] Ignorando mensaje de grupo o inválido: ${rawRemoteJid}`)
            return NextResponse.json({ received: true })
        }

        let remoteJid = rawRemoteJid
        const isFromMe = !!payload.data.key.fromMe

        // --- MAPEO LID ↔ JID (Traducción en tiempo real) ---
        // Si el mensaje es saliente y es un LID, intentamos recuperar su JID real (número) de Redis
        if (isFromMe && remoteJid.includes('@lid') && redis.status === 'ready') {
            try {
                const alias = await redis.get(`jid_alias:${remoteJid}`)
                if (alias) {
                    remoteJid = alias // Usar el número real en vez del LID!
                    console.info(`[Webhook] LID traducido a JID real: ${rawRemoteJid} -> ${remoteJid}`)
                }
            } catch {}
        }

        // Para el contexto de IA (historial, herramientas) necesitamos un número limpio.
        const senderPn = payload.data.key.senderPn
        const phoneSource = senderPn || remoteJid // Usar remoteJid ya traducido
        const senderPhone = (phoneSource.split('@')[0] || '').split(':')[0]

        // --- MAPEO LID ↔ JID (solo guardado, sin complejidad) ---
        // Cuando Evolution incluye 'previousRemoteJid' nos está diciendo que un LID y un JID son el mismo contacto.
        // Guardamos ese mapeo en Redis para que el panel de paused-chats pueda fusionar duplicados.
        const previousRemoteJid = payload.data.key.previousRemoteJid
        if (!isFromMe && previousRemoteJid && rawRemoteJid && redis.status === 'ready') {
            try {
                // Guardar en ambas direcciones para lookups rápidos
                await redis.set(`jid_alias:${previousRemoteJid}`, rawRemoteJid, 'EX', 604800) // 7 días
                await redis.set(`jid_alias:${rawRemoteJid}`, previousRemoteJid, 'EX', 604800)
            } catch {}
        }

        console.info(`[Webhook] remoteJid: ${remoteJid} | senderPhone: ${senderPhone} | fromMe: ${isFromMe}`)
        const messageType = payload.data.messageType
        // --- CONFIGURACIÓN GLOBAL (Requerida temprano para descargar audios) ---
        let configIa: any = null
        let globalError: any = null
        
        if (redis.status === 'ready') {
            try {
                const cached = await redis.get('config_ia_global')
                if (cached) configIa = JSON.parse(cached)
            } catch {}
        }
        
        if (!configIa) {
            const { data, error } = await supabase
                .from('configuracion_ia_global')
                .select('*')
                .eq('id', 1)
                .single()
            configIa = data
            globalError = error
            if (configIa && redis.status === 'ready') {
                await redis.set('config_ia_global', JSON.stringify(configIa), 'EX', 3600) // 1 hora TTL
            }
        }

        const apiBaseGlobal = configIa?.evolution_api_url?.endsWith('/') ? configIa.evolution_api_url : `${configIa?.evolution_api_url}/`
        const evoTokenGlobal = configIa?.evolution_api_key

        let messageText = ''
        if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
            messageText = payload.data.message?.conversation || payload.data.message?.extendedTextMessage?.text
        } else if (messageType === 'audioMessage') {
            let base64Audio = payload.data.message?.base64 || payload.data.message?.audioMessage?.base64 || payload.data.base64
            
            // Si el webhook no trajo base64 por defecto, lo descargamos manualmente
            if (!base64Audio && apiBaseGlobal && evoTokenGlobal && payload.data.message) {
                try {
                    console.info(`[Webhook] Descargando base64 del audio desde Evolution API para instancia: ${rawInstanceName}...`)
                    const res = await fetch(`${apiBaseGlobal}chat/getBase64FromMediaMessage/${rawInstanceName}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'apikey': evoTokenGlobal },
                        body: JSON.stringify({ message: payload.data })
                    })
                    if (res.ok) {
                        const mediaData = await res.json()
                        base64Audio = mediaData.base64
                    } else {
                        console.error('[Webhook] Error descargando audio:', await res.text())
                    }
                } catch (err: any) {
                    console.error('[Webhook] Excepción descargando audio:', err.message)
                }
            }

            if (base64Audio) {
                const { AudioTranscriberService } = await import('@/lib/ai/audio.service')
                messageText = await AudioTranscriberService.transcribe(base64Audio)
            } else {
                console.warn('[Webhook] No se pudo obtener el base64 del audio. El mensaje será ignorado.')
            }
        }

        // Si no hay texto (ej. fotos, audios no transcribibles) lo ignoramos por ahora
        if (!messageText || messageText.trim().length === 0) {
            // Pero si es un mensaje de salida (del barbero) sin texto, igual queremos pausar
            if (!payload.data.key.fromMe) return NextResponse.json({ received: true })
        }

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
        const isTestInstance = instanceName === 'pruebas' || instanceName === 'barberia'
        
        if (sucursal.agent_active === false && !isTestInstance) {
            console.info(`[Webhook] Agente IA desactivado globalmente para ${sucursal.nombre}. Ignorando respuesta.`)
            return NextResponse.json({ received: true, action: 'agent_inactive' })
        }

        // --- VALIDACIÓN DE NÚMEROS BLOQUEADOS ---
        if (!isFromMe && sucursal.blocked_phones?.length > 0) {
            const isBlocked = sucursal.blocked_phones.some((blocked: string) => 
                senderPhone.includes(blocked) || blocked.includes(senderPhone)
            )
            if (isBlocked) {
                console.info(`[Webhook] Número ${senderPhone} está bloqueado para ${sucursal.nombre}. Ignorando.`)
                return NextResponse.json({ received: true, action: 'phone_blocked' })
            }
        }

        // --- CREDENCIALES FINALES ---
        if (globalError || !configIa || !apiBaseGlobal) {
            console.error('[Webhook] Configuración global de IA incompleta (Falta Evolution URL).')
            return NextResponse.json({ received: true })
        }

        const apiBase = apiBaseGlobal
        const evoToken = sucursal.agent_evolution_key || evoTokenGlobal

        // --- LÓGICA DE MODO MANUAL / INTERVENCIÓN ---
        // 1. Si el mensaje lo envió el barbero (fromMe), activar modo manual
        if (isFromMe) {
            // EVITAR AUTO-PAUSA: Verificamos si hay un bloqueo de bot en Redis para este chat
            const botLockKey = `bot_sending:${remoteJid}`
            let isBotMessage = await redis.get(botLockKey)
            
            // Si no está, buscar en el alias por si se guardó con el otro ID
            if (!isBotMessage) {
                const alias = await redis.get(`jid_alias:${remoteJid}`)
                if (alias) {
                    isBotMessage = await redis.get(`bot_sending:${alias}`)
                    if (isBotMessage) await redis.del(`bot_sending:${alias}`)
                }
            } else {
                // Consumir el bloqueo original
                await redis.del(botLockKey)
            }

            if (isBotMessage) {
                console.info(`[Webhook] Mensaje de salida detectado (Confirmado Bot via Redis). No se requiere acción.`)
                return NextResponse.json({ received: true })
            }

            // Si la pausa por intervención está habilitada, pausamos por el tiempo configurado
            // Usamos remoteJid como clave del chat: es consistente entre msgs entrantes y salientes
            if (sucursal.intervention_pause_enabled !== false) {
                const duration = sucursal.intervention_pause_duration || 60
                console.info(`[Webhook] Intervención HUMANA detectada en ${instanceName}. Pausando agente para chat ${remoteJid} por ${duration} minutos.`)
                await debouncerService.setManualMode(sucursal.id, remoteJid, true, duration)
            } else {
                console.info(`[Webhook] Intervención HUMANA detectada en ${instanceName}, pero la pausa automática está deshabilitada.`)
            }
            
            return NextResponse.json({ received: true, mode: 'manual_activated' })
        }

        // 2. Si el cliente escribe para reactivar el agente manualmente
        if (cleanMessageText === 'activar' || cleanMessageText === 'activar agente' || cleanMessageText === 'reactivar bot' || cleanMessageText === '/activar') {
            console.info(`[Webhook] Reactivando agente para chat ${remoteJid} manualmente.`)
            await debouncerService.setManualMode(sucursal.id, remoteJid, false)
            
            return NextResponse.json({ received: true, action: 'agent_reactivated' })
        }

        // 3. Verificar si estamos en modo manual (usando remoteJid como clave del chat)
        const isManual = await debouncerService.getManualMode(sucursal.id, remoteJid)
        if (isManual) {
            console.info(`[Webhook] Agente pausado para chat ${remoteJid}. Ignorando mensaje de ${senderPhone}.`)
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
            timestamp: payload.data.messageTimestamp?.toString() ?? Date.now().toString(),
            remoteJid,
            context: {
                sucursalId: sucursal.id,
                nombre: sucursal.nombre,
                agentName: sucursal.agent_name || 'Asistente',
                personality: sucursal.agent_personality || 'friendly',
                greeting: sucursal.agent_greeting, // Conectado al campo de tu SQL
                timezone: sucursal.timezone || 'America/Hermosillo',
                customPrompt: sucursal.agent_custom_prompt,
                tipoPrestador: sucursal.tipo_prestador || 'barbero',
                tipoPrestadorLabel: sucursal.tipo_prestador_label || 'Barbero',
                agentTimeoutMs: sucursal.agent_timeout_ms || 3000,
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
