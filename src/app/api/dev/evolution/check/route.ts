import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { requireDevAuth } from '@/lib/auth'
import type { ConfigIA } from '@/lib/types.config-ia'

export async function POST(req: NextRequest) {
    const auth = await requireDevAuth(req)
    if (!auth.authenticated) return auth.response!

    try {
        const { instanceName, evolutionKey } = await req.json()

        if (!instanceName) {
            return NextResponse.json({ error: 'Falta el nombre de la instancia' }, { status: 400 })
        }

        const supabase = createClient()
        const { data: rawConfig } = await supabase.from('configuracion_ia_global').select('*').eq('id', 1).single()
        const config = rawConfig as ConfigIA | null

        const evoUrlRaw = process.env.EVOLUTION_API_INTERNAL_URL || config.evolution_api_url
        if (!evoUrlRaw) {
            return NextResponse.json({ error: 'Configuración global de Evolution no encontrada' }, { status: 500 })
        }

        const evoBaseUrl = evoUrlRaw.endsWith('/') ? evoUrlRaw : `${evoUrlRaw}/`
        const apikey = evolutionKey || config.evolution_api_key || process.env.EVOLUTION_API_KEY

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
