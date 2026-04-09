import { NextResponse } from 'next/server'
import { redis } from '@/lib/ai/debouncer.service'

/**
 * Endpoint protegido para Invalidation Activa del Caché de Catálogo de IA.
 * Se puede ejecutar mediante un Trigger en Supabase o desde el Frontend.
 * URL: POST /api/webhook/cache
 * Body: { "sucursal_id": "uuid-here" }
 */
export async function POST(req: Request) {
    try {
        const body = await req.json()
        const sucursalId = body?.record?.sucursal_id || body?.old_record?.sucursal_id || body?.sucursal_id
        
        if (!sucursalId) {
            return NextResponse.json({ success: false, error: 'sucursal_id is required' }, { status: 400 })
        }

        if (redis.status !== 'ready') {
            return NextResponse.json({ success: false, error: 'Redis no está disponible' }, { status: 503 })
        }

        const cacheKey = `catalog:${sucursalId}`
        await redis.del(cacheKey)

        console.info(`[Webhook Cache] 🧹 Caché invalidado exitosamente para sucursal: ${sucursalId}`)

        return NextResponse.json({ success: true, message: `Cache ${cacheKey} cleared` })
    } catch (e: any) {
        console.error(`[Webhook Cache] Error procesando invalidación: ${e.message}`)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
