import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { requireDevAuth } from '@/lib/auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * POST /api/auth/reset-password
 * Restablece la contraseña de un admin o barbero.
 * Requiere autenticación dev.
 *
 * Body: { table: 'usuarios_admin' | 'barberos', userId: string, newPassword: string }
 */
export async function POST(req: NextRequest) {
    const auth = await requireDevAuth(req)
    if (!auth.authenticated) return auth.response!

    try {
        const { table, userId, newPassword } = await req.json()

        if (!table || !userId || !newPassword) {
            return NextResponse.json({ error: 'Faltan parámetros: table, userId, newPassword' }, { status: 400 })
        }

        // FIX: Solo permitir reset de admins desde el panel dev
        if (table !== 'usuarios_admin') {
            return NextResponse.json({ error: 'Solo se pueden resetear contraseñas de administradores desde este endpoint' }, { status: 403 })
        }

        // FIX: Mínimo 8 caracteres
        if (newPassword.length < 8) {
            return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
        }

        const hash = await bcrypt.hash(newPassword, 10)
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { error } = await supabase
            .from(table)
            .update({ password_hash: hash })
            .eq('id', userId)

        if (error) {
            console.error('Reset password error:', error)
            return NextResponse.json({ error: 'Error al actualizar la contraseña' }, { status: 500 })
        }

        return NextResponse.json({ success: true, message: 'Contraseña actualizada correctamente' })
    } catch (error) {
        console.error('Reset password error:', error)
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
    }
}
