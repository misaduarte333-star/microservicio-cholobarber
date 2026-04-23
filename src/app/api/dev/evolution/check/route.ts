import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
    try {
        const { instanceName, evolutionKey } = await req.json()

        if (!instanceName) {
            return NextResponse.json({ error: 'Falta el nombre de la instancia' }, { status: 400 })
        }

        const supabase = createClient()
        const { data: config } = await supabase.from('configuracion_ia_global').select('*').eq('id', 1).single()

        if (!config || !config.evolution_api_url) {
            return NextResponse.json({ error: 'Configuración global de Evolution no encontrada' }, { status: 500 })
        }

        const evoBaseUrl = config.evolution_api_url.endsWith('/') ? config.evolution_api_url : `${config.evolution_api_url}/`
        const apikey = evolutionKey || config.evolution_api_key

        const res = await fetch(`${evoBaseUrl}instance/connectionState/${instanceName}`, {
            headers: { apikey },
            signal: AbortSignal.timeout(5000)
        })

        if (!res.ok) {
            const text = await res.text()
            return NextResponse.json({ success: false, error: `Error Evolution API: ${res.status}`, details: text })
        }

        const data = await res.json()
        
        return NextResponse.json({ 
            success: true, 
            state: data.instance?.state || 'UNKNOWN',
            status: data.instance?.status || 'UNKNOWN'
        })
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message || 'Error de conexión' }, { status: 500 })
    }
}
