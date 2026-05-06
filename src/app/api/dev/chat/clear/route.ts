import { NextResponse } from 'next/server'
import { MemoryService } from '@/lib/ai/memory.service'
import { requireDevAuth } from '@/lib/auth'

export async function POST(req: Request) {
    const auth = await requireDevAuth(req)
    if (!auth.authenticated) return auth.response!

    try {
        const { sucursalId, phone } = await req.json()

        if (!sucursalId || !phone) {
            return NextResponse.json({ error: 'Faltan parámetros: sucursalId o phone' }, { status: 400 })
        }

        // FIX: Usar el mismo formato de session ID que el webhook (colon, no underscore)
        const sessionId = `${sucursalId}:${phone}`
        const history = await MemoryService.getChatHistory(sessionId)
        
        await history.clear()

        console.log(`[API] Historial borrado para sesión: ${sessionId}`)

        return NextResponse.json({ success: true, message: 'Historial eliminado correctamente' })
    } catch (error: any) {
        console.error('[API] Error al borrar historial:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
