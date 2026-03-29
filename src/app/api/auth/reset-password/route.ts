import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * POST /api/auth/reset-password
 * Restablece la contraseña de un admin o barbero.
 * Solo accesible desde el panel dev (protegido por sesión dev en el frontend).
 *
 * Body: { table: 'usuarios_admin' | 'barberos', userId: string, newPassword: string }
 */
export async function POST(req: NextRequest) {
    try {
        const { table, userId, newPassword } = await req.json()

        if (!table || !userId || !newPassword) {
            return NextResponse.json({ error: 'Faltan parámetros: table, userId, newPassword' }, { status: 400 })
        }

        if (table !== 'usuarios_admin' && table !== 'barberos') {
            return NextResponse.json({ error: 'Tabla inválida' }, { status: 400 })
        }

        if (newPassword.length < 6) {
            return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
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
