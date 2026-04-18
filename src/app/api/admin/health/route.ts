import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { redis } from '@/lib/ai/debouncer.service'
import { pool } from '@/lib/ai/memory.service'
import { createClient } from '@/lib/supabase'
import { EvolutionService } from '@/lib/evolution.service'

export const dynamic = 'force-dynamic'

/**
 * Endpoint de salud del sistema.
 * Verifica la conectividad y latencia de Redis, Postgres, Supabase y Evolution API.
 */
export async function GET(req: NextRequest) {
    const results = {
        redis: { status: 'down', latency: 0, error: null as string | null },
        postgres: { status: 'down', latency: 0, error: null as string | null },
        supabase: { status: 'down', latency: 0, error: null as string | null },
        evolution: { status: 'down', latency: 0, error: null as string | null, synced: false, message: '' as string },
        timestamp: new Date().toISOString()
    }

    // 1. Redis Check
    const startRedis = performance.now()
    try {
        // Timeout de 2s para evitar colgar el health check en dev
        await Promise.race([
            redis.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout (2s)')), 2000))
        ])
        results.redis.status = 'up'
        results.redis.latency = Math.round(performance.now() - startRedis)
    } catch (err: any) {
        results.redis.error = err.message
    }

    // 2. Postgres Check
    const startPg = performance.now()
    try {
        await pool.query('SELECT 1')
        results.postgres.status = 'up'
        results.postgres.latency = Math.round(performance.now() - startPg)
    } catch (err: any) {
        results.postgres.error = err.message
    }

    // 3. Supabase Check
    const startSupa = performance.now()
    try {
        const supabase = createClient()
        const { error } = await supabase.from('sucursales').select('id', { count: 'exact', head: true }).limit(1)
        if (error) throw error
        results.supabase.status = 'up'
        results.supabase.latency = Math.round(performance.now() - startSupa)
    } catch (err: any) {
        results.supabase.error = err.message
    }

    // 4. Evolution API Check & Sync
    try {
        const headersList = await headers()
        const forwardedHost = headersList.get('x-forwarded-host')
        const forwardedProto = headersList.get('x-forwarded-proto') || 'https'
        const appUrlForSync = process.env.NEXT_PUBLIC_APP_URL
            || process.env.APP_URL
            || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.url)

        // Sincronizar webhook primero (esto consume tiempo de Supabase/Red)
        const syncRes = await EvolutionService.syncWebhook(appUrlForSync)
        results.evolution.synced = syncRes.success
        results.evolution.message = syncRes.message

        // Obtener configuración para el ping individual
        const supabase = createClient()
        const { data } = await supabase.from('configuracion_ia_global').select('evolution_api_url, evolution_api_key').eq('id', 1).single()
        const config = data as any
        
        if (config && config.evolution_api_url) {
            const evoUrl = config.evolution_api_url
            const evoKey = config.evolution_api_key

            // --- AQUÍ EMPIEZA LA MEDICIÓN REAL DE EVOLUTION ---
            const startEvo = performance.now()
            const response = await fetch(`${evoUrl}/instance/fetchInstances`, {
                method: 'GET',
                headers: { 'apikey': evoKey },
                signal: AbortSignal.timeout(5000)
            })

            if (response.ok) {
                results.evolution.status = 'up'
                results.evolution.latency = Math.round(performance.now() - startEvo)
            } else {
                results.evolution.error = `HTTP Error ${response.status}`
            }
        } else {
            results.evolution.error = 'No Evolution Config in DB'
        }
    } catch (err: any) {
        results.evolution.error = err.message
    }

    return NextResponse.json(results)
}
