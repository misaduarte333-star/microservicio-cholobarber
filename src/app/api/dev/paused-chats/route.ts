import { NextResponse } from 'next/server'
import { redis } from '@/lib/ai/debouncer.service'

/**
 * GET /api/dev/paused-chats?sucursalId=xxx
 * Retorna todos los chats pausados actualmente para una sucursal, con el TTL restante.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const sucursalId = searchParams.get('sucursalId')

        if (!sucursalId) {
            return NextResponse.json({ error: 'sucursalId es requerido' }, { status: 400 })
        }

        if (redis.status !== 'ready') {
            return NextResponse.json({ paused: [], error: 'Redis no disponible' })
        }

        // Buscar todas las claves de pausa manual para esta sucursal
        const pattern = `manual_mode:${sucursalId}:*`
        const keys = await redis.keys(pattern)

        const paused = await Promise.all(
            keys.map(async (key) => {
                const ttl = await redis.ttl(key)      // segundos restantes, -1 = sin expiración, -2 = ya no existe
                const chatId = key.replace(`manual_mode:${sucursalId}:`, '')
                return {
                    key,
                    chatId,           // remoteJid o número
                    ttlSeconds: ttl > 0 ? ttl : 0,
                }
            })
        )

        // Filtrar los que ya expiraron y ordenar por TTL ascendente
        const active = paused
            .filter(p => p.ttlSeconds > 0)
            .sort((a, b) => a.ttlSeconds - b.ttlSeconds)

        return NextResponse.json({ paused: active, total: active.length })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

/**
 * DELETE /api/dev/paused-chats
 * Body: { sucursalId, chatId }
 * Elimina la pausa manual de un chat específico.
 */
export async function DELETE(req: Request) {
    try {
        const { sucursalId, chatId } = await req.json()

        if (!sucursalId || !chatId) {
            return NextResponse.json({ error: 'sucursalId y chatId son requeridos' }, { status: 400 })
        }

        if (redis.status !== 'ready') {
            return NextResponse.json({ error: 'Redis no disponible' }, { status: 503 })
        }

        const key = `manual_mode:${sucursalId}:${chatId}`
        await redis.del(key)

        console.info(`[PausedChats] Pausa eliminada manualmente para chat: ${chatId} (Sucursal: ${sucursalId})`)
        return NextResponse.json({ success: true })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
