import { MetricsService } from './src/lib/ai/metrics.service'
import { getAISupabaseClient } from './src/lib/ai/tools/business.tools'

async function checkLogs() {
    const supabase = getAISupabaseClient()
    const { data, error } = await supabase
        .from('ia_request_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

    if (error) {
        console.error('Error fetching logs:', error.message)
        return
    }

    console.log('--- RECENT AI LOGS ---')
    data.forEach(log => {
        console.log(`[${log.created_at}] Session: ${log.session_id} | Ref: ${log.phone}`)
        console.log(`Input: ${log.input_preview}`)
        console.log(`Output: ${log.output_preview.substring(0, 50)}...`)
        if (log.error) {
            console.error(`ERROR: ${log.error}`)
        }
        console.log(`Latency: ${log.latency_ms}ms | Tools: ${JSON.stringify(log.tools_used)}`)
        console.log('----------------------')
    })
}

checkLogs()
