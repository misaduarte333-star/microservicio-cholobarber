import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * GET /api/dev/users
 * Devuelve la lista de admins y barberos para el panel dev.
 * Usa service role key para bypasear RLS.
 */
export async function GET() {
    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const [adminResult, barberoResult] = await Promise.all([
            supabase
                .from('usuarios_admin')
                .select('id, nombre, email, sucursal:sucursales(nombre)')
                .eq('activo', true),
            supabase
                .from('barberos')
                .select('id, nombre, usuario_tablet, sucursal:sucursales(nombre)')
                .eq('activo', true)
        ])

        const admins = (adminResult.data || []).map((a: any) => ({
            id: a.id,
            nombre: a.nombre,
            email: a.email,
            sucursal_nombre: a.sucursal?.nombre || ''
        }))

        const barberos = (barberoResult.data || []).map((b: any) => ({
            id: b.id,
            nombre: b.nombre,
            usuario_tablet: b.usuario_tablet,
            sucursal_nombre: b.sucursal?.nombre || ''
        }))

        return NextResponse.json({ admins, barberos })
    } catch (error) {
        console.error('Error fetching dev users:', error)
        return NextResponse.json({ admins: [], barberos: [] }, { status: 500 })
    }
}
