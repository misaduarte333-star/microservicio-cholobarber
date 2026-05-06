import { NextResponse } from 'next/server'
import { redis } from '@/lib/ai/debouncer.service'
import { requireDevAuth } from '@/lib/auth'

/**
 * GET /api/dev/paused-chats?sucursalId=xxx
 * Retorna todos los chats pausados actualmente para una sucursal, con el TTL restante.
 * Fusiona automáticamente entradas duplicadas (LID y número del mismo contacto).
 */
export async function GET(req: Request) {
    const auth = await requireDevAuth(req)
    if (!auth.authenticated) return auth.response!

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

        // Obtener TTL de cada clave
        const raw = await Promise.all(
            keys.map(async (key) => {
                const ttl = await redis.ttl(key)
                const chatId = key.replace(`manual_mode:${sucursalId}:`, '')
                return { key, chatId, ttlSeconds: ttl > 0 ? ttl : 0 }
            })
        )

        const active = raw.filter(p => p.ttlSeconds > 0)

        // --- FUSIONAR DUPLICADOS (LID + número del mismo contacto) ---
        // Para cada entrada, verificar si existe un alias (jid_alias:chatId)
        const seen = new Set<string>()
        const merged: Array<{ chatId: string, displayId: string, ttlSeconds: number }> = []

        for (const entry of active) {
            if (seen.has(entry.chatId)) continue

            // Buscar si este chatId tiene un alias registrado
            let alias: string | null = null
            try {
                alias = await redis.get(`jid_alias:${entry.chatId}`)
            } catch {}

            if (alias) {
                // Verificar si el alias también tiene una pausa activa
                const aliasKey = `manual_mode:${sucursalId}:${alias}`
                const aliasTtl = await redis.ttl(aliasKey).catch(() => -2)

                // Marcar ambos como vistos
                seen.add(entry.chatId)
                seen.add(alias)

                // Usar el mayor TTL y preferir el ID que NO sea un LID como displayId
                const bestTtl = aliasTtl > 0 ? Math.max(entry.ttlSeconds, aliasTtl) : entry.ttlSeconds
                const isLid = entry.chatId.includes('@lid')
                const displayId = isLid ? (alias || entry.chatId) : entry.chatId

                // Si el alias también tiene pausa, el TTL mayor gana; si no, solo usar el actual
                merged.push({ chatId: entry.chatId, displayId, ttlSeconds: bestTtl })

                // Si el alias tiene pausa activa pero más larga, actualizar la clave principal
                if (aliasTtl > entry.ttlSeconds && aliasTtl > 0) {
                    try {
                        await redis.set(entry.key, 'true', 'EX', aliasTtl)
                    } catch {}
                }
            } else {
                // Sin alias conocido, mostrar tal cual
                seen.add(entry.chatId)
                const isLid = entry.chatId.includes('@lid')
                merged.push({
                    chatId: entry.chatId,
                    displayId: isLid ? entry.chatId : entry.chatId,
                    ttlSeconds: entry.ttlSeconds
                })
            }
        }

        merged.sort((a, b) => a.ttlSeconds - b.ttlSeconds)

        return NextResponse.json({ paused: merged, total: merged.length })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

/**
 * DELETE /api/dev/paused-chats
 * Body: { sucursalId, chatId }
 * Elimina la pausa manual de un chat específico (y su alias si existe).
 */
export async function DELETE(req: Request) {
    const auth = await requireDevAuth(req)
    if (!auth.authenticated) return auth.response!

    try {
        const { sucursalId, chatId } = await req.json()

        if (!sucursalId || !chatId) {
            return NextResponse.json({ error: 'sucursalId y chatId son requeridos' }, { status: 400 })
        }

        if (redis.status !== 'ready') {
            return NextResponse.json({ error: 'Redis no disponible' }, { status: 503 })
        }

        // Eliminar la clave principal
        const key = `manual_mode:${sucursalId}:${chatId}`
        await redis.del(key)

        // También eliminar el alias si existe
        try {
            const alias = await redis.get(`jid_alias:${chatId}`)
            if (alias) {
                const aliasKey = `manual_mode:${sucursalId}:${alias}`
                await redis.del(aliasKey)
            }
        } catch {}

        console.info(`[PausedChats] Pausa eliminada manualmente para chat: ${chatId} (Sucursal: ${sucursalId})`)
        return NextResponse.json({ success: true })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
