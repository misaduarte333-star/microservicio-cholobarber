import { createClient } from '@supabase/supabase-js'

export interface ToolStep {
    name: string
    input: Record<string, any>
    output: string
    databaseInteraction?: string | string[]
}

export interface RequestLog {
    id: string
    timestamp: number
    sucursalId: string
    sessionId: string
    phone: string
    inputPreview: string
    outputPreview: string
    latencyMs: number
    toolsUsed: ToolStep[]
    error?: string
    source: 'webhook' | 'chat'
}

import { getAISupabaseClient } from './tools/business.tools'

export class MetricsService {
    /**
     * Guarda la ejecución en la base de datos de manera asíncrona.
     * No bloquea el hilo principal.
     */
    static record(log: RequestLog): void {
        const supabase = getAISupabaseClient()
        supabase.from('ia_request_logs').insert([{
            id: log.id,
            sucursal_id: log.sucursalId,
            session_id: log.sessionId,
            phone: log.phone,
            input_preview: log.inputPreview,
            output_preview: log.outputPreview,
            latency_ms: log.latencyMs,
            tools_used: JSON.parse(JSON.stringify(log.toolsUsed)),
            error: log.error || null,
            source: log.source,
        }]).then(({ error }: { error: any }) => {
            if (error) console.error('[MetricsService] Error insertando log en Supabase:', error.message)
        })
    }
}
