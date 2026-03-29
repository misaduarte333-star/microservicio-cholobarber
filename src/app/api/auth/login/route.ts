import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * POST /api/auth/login
 * Recibe { identifier, password } y determina automáticamente el rol:
 * 1. Primero intenta como Desarrollador (solo si env vars están configuradas)
 * 2. Luego como Admin (tabla usuarios_admin, busca por email)
 * 3. Finalmente como Barbero (tabla barberos, busca por usuario_tablet)
 */
export async function POST(req: NextRequest) {
    try {
        const { identifier, password } = await req.json()

        if (!identifier || !password) {
            return NextResponse.json({ error: 'Usuario y contraseña son requeridos' }, { status: 400 })
        }

        const trimmedId = identifier.trim()
        const lowerId = trimmedId.toLowerCase()

        // ─── 1. Check Developer credentials (only if explicitly configured) ───
        const devEmail = process.env.DEV_EMAIL?.toLowerCase()
        const devPassword = process.env.DEV_PASSWORD

        if (devEmail && devPassword && lowerId === devEmail && password === devPassword) {
            return NextResponse.json({
                success: true,
                role: 'dev',
                user: { email: devEmail, nombre: 'Desarrollador' },
                redirect: '/dev'
            })
        }

        const supabase = createClient(supabaseUrl, supabaseKey)

        // ─── 2. Check Admin (by email) ───
        if (lowerId.includes('@')) {
            const { data: admin } = await supabase
                .from('usuarios_admin')
                .select('id, nombre, email, rol, sucursal_id, password_hash')
                .eq('email', lowerId)
                .eq('activo', true)
                .maybeSingle()

            if (admin) {
                const match = await bcrypt.compare(password, admin.password_hash)
                if (match) {
                    return NextResponse.json({
                        success: true,
                        role: 'admin',
                        user: {
                            id: admin.id,
                            nombre: admin.nombre,
                            email: admin.email,
                            rol: admin.rol,
                            sucursal_id: admin.sucursal_id
                        },
                        redirect: '/admin'
                    })
                }
            }
        }

        // ─── 3. Check Barber (by usuario_tablet, case-insensitive) ───
        const { data: barberos } = await supabase
            .from('barberos')
            .select('id, sucursal_id, nombre, estacion_id, usuario_tablet, password_hash, horario_laboral, bloqueo_almuerzo, activo, hora_entrada')
            .ilike('usuario_tablet', trimmedId)
            .eq('activo', true)
            .limit(1)

        const barbero = barberos?.[0]
        if (barbero) {
            const match = await bcrypt.compare(password, barbero.password_hash)
            if (match) {
                return NextResponse.json({
                    success: true,
                    role: 'barbero',
                    user: barbero,
                    redirect: '/tablet'
                })
            }
        }

        // ─── Nothing matched ───
        return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
    } catch (error) {
        console.error('Login error:', error)
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
    }
}
