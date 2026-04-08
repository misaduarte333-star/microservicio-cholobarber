import Redis from 'ioredis'
import { AgentService, AgentContext } from './agent.service'

const globalForRedis = globalThis as unknown as {
    redis: Redis | undefined
    isLocalMemory: boolean // Flag para depuración
}

export const redis = globalForRedis.redis ?? new Redis(process.env.AGENT_REDIS_URL!, {
    connectTimeout: 2000,
    commandTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => null, // Desactivar reconexiones infinitas en dev
    enableOfflineQueue: false     // No encolar comandos si está desconectado
})

redis.on('error', () => { /* Silenciar logs de error para no saturar terminal */ })

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

// Storage temporal en memoria si Redis falla
const memoryStorage = new Map<string, string[]>()
const memoryTimer = new Set<string>()

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

        // Intentar Redis primero
        if (redis.status === 'ready') {
            try {
                await redis.rpush(listKey, JSON.stringify(msg))
                const hasTimer = await redis.get(timerKey)
                if (!hasTimer) {
                    await redis.set(timerKey, 'running', 'EX', 10)
                    setTimeout(() => this.processBuffer(msg.senderPhone, msg.context, msg.remoteJid), this.DEBOUNCE_TIME_MS)
                }
                return
            } catch (err) {
                console.warn('[Debouncer] Redis falló, usando memoria...')
            }
        }

        // Fallback a Memoria
        if (!memoryStorage.has(listKey)) memoryStorage.set(listKey, [])
        memoryStorage.get(listKey)!.push(JSON.stringify(msg))

        if (!memoryTimer.has(timerKey)) {
            memoryTimer.add(timerKey)
            setTimeout(() => this.processBuffer(msg.senderPhone, msg.context, msg.remoteJid), this.DEBOUNCE_TIME_MS)
        }
    }

    private async processBuffer(phone: string, ctx: AgentContext, remoteJid: string) {
        const listKey = `buffer:${ctx.sucursalId}:${phone}`
        const timerKey = `timer:${ctx.sucursalId}:${phone}`
        const unsentKey = `${this.UNSENT_KEY_PREFIX}${ctx.sucursalId}:${phone}`

        let messages: string[] = []
        
        if (redis.status === 'ready') {
            try {
                messages = await redis.lrange(listKey, 0, -1)
                await redis.del(listKey)
                await redis.del(timerKey)
            } catch {
                messages = memoryStorage.get(listKey) || []
            }
        } else {
            messages = memoryStorage.get(listKey) || []
            memoryStorage.delete(listKey)
            memoryTimer.delete(timerKey)
        }

        if (messages.length === 0) return

        const evoToken = (ctx as any).evoToken
        const evoEndpoint = (ctx as any).evoEndpoint

        // 1. Re-enviar mensajes si hubo una falla en el turno anterior (Solo Redis soporta persistencia real aquí)
        if (redis.status === 'ready') {
            try {
                const unsentRaw = await redis.get(unsentKey)
                if (unsentRaw && evoEndpoint) {
                    let unsent: any
                    try { unsent = JSON.parse(unsentRaw) } catch { await redis.del(unsentKey) }
                    if (unsent?.text) {
                        const res = await this.sendEvolutionMessage(evoEndpoint, evoToken, remoteJid, unsent.text)
                        if (res) await redis.del(unsentKey)
                    }
                }
            } catch { /* Ignorar fallos de persistencia en dev */ }
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

            // 3. Persistir en caché por si falla el envío HTTPS (Solo si Redis está ok)
            if (redis.status === 'ready') {
                try {
                    await redis.set(unsentKey, JSON.stringify({ text: output, at: Date.now() }), 'EX', 3600)
                } catch {}
            }

            // 4. Enviar a Evolution
            if (evoEndpoint && output) {
                const sent = await this.sendEvolutionMessage(evoEndpoint, evoToken, phone, output)
                if (sent && redis.status === 'ready') {
                    try { await redis.del(unsentKey) } catch {}
                } else if (!sent) {
                    console.error(`[Debouncer] Error de red. Mensaje a ${phone} es unsent.`)
                }
            } else {
                console.warn('Simulando envío local por falta de credentials Evolution en Contexto:', output)
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
            console.log(`[Debouncer] Enviando mensaje a Evolution API: ${endpoint} | Contacto: ${jid}`);
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': token },
                body: JSON.stringify({
                    number: jid,
                    text: text
                })
            });
            if (!res.ok) {
                const errText = await res.text();
                console.error(`[Evolution API Error] sendText failed. Status: ${res.status}, Body: ${errText}`);
                return false;
            }
            return true;
        } catch (error: any) {
            console.error(`[Evolution Net Error] Catch exception sending to Evolution: ${error.message}`);
            return false;
        }
    }

    private async sendEvolutionPresence(endpoint: string, token: string, jid: string, presence: string): Promise<boolean> {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': token },
                body: JSON.stringify({
                    number: jid,
                    presence,
                    delay: 5000
                })
            });
            if (!res.ok) {
                console.error(`[Evolution API Error] sendPresence failed: ${res.status}`);
            }
            return res.ok;
        } catch (err: any) { 
            console.error(`[Evolution Net Error] sendPresence exception: ${err.message}`);
            return false; 
        }
    }
}

export const debouncerService = new DebouncerService()
