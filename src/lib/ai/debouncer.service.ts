import Redis from 'ioredis'
import { AgentService, AgentContext } from './agent.service'

const globalForRedis = globalThis as unknown as {
    redis: Redis | undefined
}

const redis = globalForRedis.redis ?? new Redis(process.env.AGENT_REDIS_URL!)

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

export interface IncomingMessage {
    sessionId: string
    senderPhone: string
    pushName: string
    text: string
    timestamp: string
    context: AgentContext
    remoteJid: string
}

export class DebouncerService {
    private readonly DEBOUNCE_TIME_MS = 3000 // 3 seconds configured as per user setup
    private readonly UNSENT_KEY_PREFIX = 'unsent:'

    /**
     * Empuja un mensaje al buffer de Redis para este turno e inicia el timer si no existía.
     */
    public async pushMessage(msg: IncomingMessage) {
        const listKey = `buffer:${msg.context.sucursalId}:${msg.senderPhone}`
        const timerKey = `timer:${msg.context.sucursalId}:${msg.senderPhone}`

        await redis.rpush(listKey, JSON.stringify(msg))

        const hasTimer = await redis.get(timerKey)
        if (!hasTimer) {
            await redis.set(timerKey, 'running', 'EX', 10) // Fallback si setTimeout falla
            
            setTimeout(
                () => this.processBuffer(msg.senderPhone, msg.context, msg.remoteJid),
                this.DEBOUNCE_TIME_MS
            )
        }
    }

    private async processBuffer(phone: string, ctx: AgentContext, remoteJid: string) {
        const listKey = `buffer:${ctx.sucursalId}:${phone}`
        const timerKey = `timer:${ctx.sucursalId}:${phone}`
        const unsentKey = `${this.UNSENT_KEY_PREFIX}${ctx.sucursalId}:${phone}`

        const messages = await redis.lrange(listKey, 0, -1)
        await redis.del(listKey)
        await redis.del(timerKey)

        if (messages.length === 0) return

        // Extraer la configuración API a la que responder
        // (En la vida real usarías una tabla de Evolution, pero ya se mapeó en route.ts el global y el local).
        // En NEXT_PUBLIC no tenemos el global object aquí a mano, así que route.ts nos lo proveyó en ctx?
        // Wait, route.ts provided `globalOpenAiKey` but didn't provide evoToken o evoPlatformBase...
        // Let's pass the evo token inside the context. I'll modify context to carry it.
        const evoToken = (ctx as any).evoToken
        const evoEndpoint = (ctx as any).evoEndpoint

        // 1. Re-enviar mensajes si hubo una falla en el turno anterior
        const unsentRaw = await redis.get(unsentKey)
        if (unsentRaw && evoEndpoint) {
            let unsent: any
            try {
                unsent = JSON.parse(unsentRaw)
            } catch {
                await redis.del(unsentKey)
            }
            if (unsent?.text) {
                console.warn(`[Debouncer] Reenviando mensaje fallido previo a ${phone}`)
                const res = await this.sendEvolutionMessage(evoEndpoint, evoToken, remoteJid, unsent.text)
                if (res) await redis.del(unsentKey)
            }
        }

        // 2. Parsear mensajes
        const parsedMessages: IncomingMessage[] = messages.flatMap((m: string) => {
            try { return [JSON.parse(m) as IncomingMessage] } catch { return [] }
        })

        if (parsedMessages.length === 0) return

        const combinedText = parsedMessages.map((m: IncomingMessage) => m.text).join('\n')
        const sessionId = parsedMessages[0].sessionId

        console.info(`[Debouncer] Procesando lote para ${phone}: ${parsedMessages.length} msgs`)

        try {
            // Mostrar estado "Escribiendo..."
            if (evoEndpoint) {
                await this.sendEvolutionPresence(evoEndpoint.replace('sendText', 'presence'), evoToken, remoteJid, 'composing')
            }

            // Llamar al LLM!
            const result = await AgentService.run(sessionId, combinedText, phone, ctx)
            const output = result.response
            console.info(`[Debouncer] Agente Respondió a ${phone}: ${output.substring(0, 50)}...`)

            // 3. Persistir en caché por si falla el envío HTTPS
            await redis.set(unsentKey, JSON.stringify({ text: output, at: Date.now() }), 'EX', 3600)

            // 4. Enviar a Evolution
            if (evoEndpoint && output) {
                const sent = await this.sendEvolutionMessage(evoEndpoint, evoToken, remoteJid, output)
                if (sent) {
                    await redis.del(unsentKey) // LLegó correctamente
                } else {
                    console.error(`[Debouncer] Error de red. Mensaje a ${phone} es unsent.`)
                }
            } else {
                console.warn('Simulando envío local por falta de credentials Evolution en Contexto:', output)
                await redis.del(unsentKey)
            }

        } catch (error: any) {
            console.error('[Debouncer] AI Error:', error.message)
            if (evoEndpoint) {
                await this.sendEvolutionMessage(evoEndpoint, evoToken, remoteJid, 'Ups, tuve un problema interno de conexión. Dame unos minutos.')
            }
        }
    }

    private async sendEvolutionMessage(endpoint: string, token: string, jid: string, text: string): Promise<boolean> {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': token },
                body: JSON.stringify({
                    number: jid,
                    options: { delay: 1200 },
                    textMessage: { text }
                })
            })
            return res.ok
        } catch {
            return false
        }
    }

    private async sendEvolutionPresence(endpoint: string, token: string, jid: string, presence: string): Promise<boolean> {
        try {
            await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': token },
                body: JSON.stringify({
                    number: jid,
                    presence,
                    delay: 5000
                })
            })
            return true
        } catch { return false }
    }
}

export const debouncerService = new DebouncerService()
