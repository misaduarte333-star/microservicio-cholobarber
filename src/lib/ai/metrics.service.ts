import { createClient } from '@supabase/supabase-js'

export interface ToolStep {
    name: string
    input: Record<string, any>
    output: string
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export class MetricsService {
    /**
     * Guarda la ejecución en la base de datos de manera asíncrona.
     * No bloquea el hilo principal.
     */
    static record(log: RequestLog): void {
        supabase.from('request_logs').insert([{
            id: log.id,
            timestamp: log.timestamp,
            session_id: log.sessionId,
            phone: log.phone,
            input_preview: log.inputPreview,
            output_preview: log.outputPreview,
            latency_ms: log.latencyMs,
            tools_used: JSON.parse(JSON.stringify(log.toolsUsed)),
            error: log.error || null,
            source: log.source,
        }]).then(({ error }) => {
            if (error) console.error('[MetricsService] Error insertando log en Supabase:', error.message)
        })
    }
}
