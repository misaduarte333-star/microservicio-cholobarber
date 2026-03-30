import { NextResponse } from 'next/server'
import { redis } from '@/lib/ai/debouncer.service'
import { pool } from '@/lib/ai/memory.service'
import { createClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * Endpoint de salud del sistema.
 * Verifica la conectividad y latencia de Redis, Postgres, Supabase y Evolution API.
 */
export async function GET() {
    const results = {
        redis: { status: 'down', latency: 0, error: null as string | null },
        postgres: { status: 'down', latency: 0, error: null as string | null },
        supabase: { status: 'down', latency: 0, error: null as string | null },
        evolution: { status: 'down', latency: 0, error: null as string | null },
        timestamp: new Date().toISOString()
    }

    // 1. Redis Check
    const startRedis = performance.now()
    try {
        await redis.ping()
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

    // 4. Evolution API Check
    const startEvo = performance.now()
    try {
        const evoUrl = process.env.EVOLUTION_API_URL || ''
        const evoKey = process.env.EVOLUTION_API_KEY || ''
        
        // Intentamos llamar a un endpoint ligero o simplemente al base
        const response = await fetch(`${evoUrl}/instance/fetchInstances`, {
            method: 'GET',
            headers: { 'apikey': evoKey },
            // Timeout corto para no bloquear el dashboard
            signal: AbortSignal.timeout(5000)
        })
        
        if (response.ok) {
            results.evolution.status = 'up'
            results.evolution.latency = Math.round(performance.now() - startEvo)
        } else {
            results.evolution.error = `HTTP Error ${response.status}`
        }
    } catch (err: any) {
        results.evolution.error = err.message
    }

    return NextResponse.json(results)
}
