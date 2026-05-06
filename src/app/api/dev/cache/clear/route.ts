import { NextResponse } from 'next/server'
import { CatalogCacheService } from '@/lib/ai/catalog-cache.service'
import { requireDevAuth } from '@/lib/auth'

export async function POST(req: Request) {
    const auth = await requireDevAuth(req)
    if (!auth.authenticated) return auth.response!

    try {
        const { sucursalId } = await req.json()

        if (!sucursalId) {
            return NextResponse.json({ error: 'sucursalId requerido' }, { status: 400 })
        }

        const success = await CatalogCacheService.invalidate(sucursalId)

        if (!success) {
            return NextResponse.json({ 
                error: 'No se pudo invalidar la caché. Verifique la conexión a Redis.' 
            }, { status: 500 })
        }

        return NextResponse.json({ 
            success: true, 
            message: `Caché invalidada para la sucursal ${sucursalId}` 
        })

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
