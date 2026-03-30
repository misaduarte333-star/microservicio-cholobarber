import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { searchParams } = new URL(req.url)
    const sucursalId = searchParams.get('sucursalId')

    if (!sucursalId) {
        return NextResponse.json({ error: 'Sucursal ID required' }, { status: 400 })
    }

    try {
        // Fetch last 24h logs
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        
        const { data: logs, error } = await supabase
            .from('request_logs')
            .select('*')
            .like('session_id', `${sucursalId}:%`)
            .gte('created_at', yesterday)

        if (error) throw error

        const totalRequests = logs.length
        const avgLatency = totalRequests > 0 
            ? logs.reduce((acc, curr) => acc + (curr.latency_ms || 0), 0) / totalRequests 
            : 0
        
        const errors = logs.filter(l => !!l.error).length
        const successRate = totalRequests > 0 ? ((totalRequests - errors) / totalRequests) * 100 : 100

        // Tool distribution
        const toolUsage: Record<string, number> = {}
        logs.forEach(log => {
            const tools = log.tools_used || []
            tools.forEach((t: any) => {
                toolUsage[t.name] = (toolUsage[t.name] || 0) + 1
            })
        })

        return NextResponse.json({
            stats: {
                totalRequests,
                avgLatency: Math.round(avgLatency),
                successRate: Math.round(successRate * 10) / 10,
                errors
            },
            toolUsage: Object.entries(toolUsage).map(([name, count]) => ({ name, count })),
            timeline: [] // Simplified for now
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
