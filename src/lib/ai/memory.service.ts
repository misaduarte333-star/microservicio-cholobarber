import { PostgresChatMessageHistory } from '@langchain/community/stores/message/postgres'
import { BaseChatMessageHistory } from '@langchain/core/chat_history'
import { BaseMessage, HumanMessage } from '@langchain/core/messages'
import { Pool } from 'pg'

// 1. Singleton pattern adaptado a Next.js (evita agotar conexiones por HMR)
const globalForPg = globalThis as unknown as {
    pgPool: Pool | undefined
}

const pool = globalForPg.pgPool ?? new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
})

if (process.env.NODE_ENV !== 'production') globalForPg.pgPool = pool

export { pool }

/**
 * Wrapper sobre el historial real para limitar mensajes y forzar la re-validación
 * de zonas horarias en cada turno, eliminando alucinaciones del modelo.
 */
class FreshContextHistory extends BaseChatMessageHistory {
    lc_namespace = ['cholobot', 'memory']
    private static readonly MAX_MESSAGES = 10

    constructor(
        private inner: PostgresChatMessageHistory,
        private timezone: string
    ) {
        super()
    }

    async getMessages(): Promise<BaseMessage[]> {
        let all: BaseMessage[] = []
        try {
            all = await this.inner.getMessages()
        } catch (error: any) {
            console.error(`[MemoryService] Error recuperando historial (${error.message}). Continuando sin contexto.`)
            // Fallback a lista vacía para no romper el flujo con Error 500
            return []
        }

        const limited = all.slice(-FreshContextHistory.MAX_MESSAGES)
        if (limited.length === 0) return []

        const formatter = new Intl.DateTimeFormat('es-MX', {
            timeZone: this.timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        })
        const now = formatter.format(new Date())

        const staleWarning = new HumanMessage(
            `[SISTEMA ${now}] Nuevo turno iniciado. ` +
            `REGLA DE CIERRE: Si el historial muestra que el cliente ya confirmó ("sí", "listo", "agenda"), ` +
            `debes obtener el cliente_id con BUSCAR_CLIENTE y EJECUTAR AGENDAR_CITA en este turno. ` +
            `No respondas con texto de "éxito" si no llamas a la herramienta técnica correspondinte.`
        )

        return [staleWarning, ...limited]
    }

    async addMessage(message: BaseMessage): Promise<void> {
        try {
            return await this.inner.addMessage(message)
        } catch (error: any) {
            console.warn(`[MemoryService] No se pudo guardar mensaje en DB: ${error.message}`)
        }
    }

    async addMessages(messages: BaseMessage[]): Promise<void> {
        try {
            return await this.inner.addMessages(messages)
        } catch (error: any) {
            console.warn(`[MemoryService] No se pudieron guardar mensajes en DB: ${error.message}`)
        }
    }

    async addUserMessage(message: string): Promise<void> {
        try {
            return await this.inner.addUserMessage(message)
        } catch (error: any) {
            console.warn(`[MemoryService] No se pudo guardar mensaje de usuario: ${error.message}`)
        }
    }

    async addAIMessage(message: string): Promise<void> {
        try {
            return await this.inner.addAIMessage(message)
        } catch (error: any) {
            console.warn(`[MemoryService] No se pudo guardar mensaje de IA: ${error.message}`)
        }
    }

    async clear(): Promise<void> {
        return this.inner.clear()
    }
}

export class MemoryService {
    /**
     * Retorna el historial de chat envuelto en FreshContextHistory, conectado a "evolutiondb".
     */
    public static async getChatHistory(sessionId: string, timezone: string = 'America/Hermosillo'): Promise<BaseChatMessageHistory> {
        
        // Creamos la tabla n8n_chat_histories de forma segura tras la conexión
        const inner = new PostgresChatMessageHistory({
            sessionId,
            pool,
            tableName: 'n8n_chat_histories' // Tabla en PostgreSQL para el historial de mensajes
        })

        return new FreshContextHistory(inner, timezone)
    }
}
