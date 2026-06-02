import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * POST /api/internal/test-apps/reset
 * Crea o actualiza los negocios/cuentas de prueba para las apps Básico y Premium.
 * Se autentica verificando la cookie de sesión con rol 'dev', o con el DASHBOARD_TOKEN.
 */
export async function POST(req: NextRequest) {
    // Auth: allow if dev session cookie OR DASHBOARD_TOKEN header
    const dashboardToken = process.env.DASHBOARD_TOKEN
    const authHeader = req.headers.get('authorization')
    
    let isAuth = false

    if (dashboardToken && authHeader === `Bearer ${dashboardToken}`) {
        isAuth = true
    }

    if (!isAuth) {
        const sessionCookie = req.cookies.get('session')
        if (sessionCookie) {
            try {
                const session = JSON.parse(sessionCookie.value)
                if (session?.role === 'dev') isAuth = true
            } catch { /* ignore */ }
        }
    }

    if (!isAuth) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const testAccounts = [
        {
            nombre: 'App Pruebas Básico',
            slug: 'app-pruebas-basico',
            plan: 'basico',
            email: 'basico@sonorusapp.com',
            password: 'test_basico_123'
        },
        {
            nombre: 'App Pruebas Premium',
            slug: 'app-pruebas-premium',
            plan: 'premium',
            email: 'premium@sonorusapp.com',
            password: 'test_premium_123'
        }
    ]

    const results: string[] = []

    try {
        for (const acc of testAccounts) {
            let sucursalId: string

            // 1. Buscar o crear sucursal
            const { data: existing } = await supabase
                .from('sucursales')
                .select('id')
                .eq('slug', acc.slug)
                .maybeSingle()

            if (existing) {
                sucursalId = existing.id
                await supabase.from('sucursales').update({ plan: acc.plan, activa: true }).eq('id', sucursalId)
                results.push(`Sucursal ${acc.slug}: actualizada`)
            } else {
                const { data: newSuc, error: sucErr } = await supabase
                    .from('sucursales')
                    .insert([{
                        nombre: acc.nombre,
                        slug: acc.slug,
                        plan: acc.plan,
                        telefono_whatsapp: '0000000000',
                        activa: true,
                        agent_enabled: false,
                        agent_active: false,
                        horario_apertura: {
                            lunes: { apertura: '09:00', cierre: '20:00' },
                            martes: { apertura: '09:00', cierre: '20:00' },
                            miercoles: { apertura: '09:00', cierre: '20:00' },
                            jueves: { apertura: '09:00', cierre: '20:00' },
                            viernes: { apertura: '09:00', cierre: '20:00' },
                            sabado: { apertura: '09:00', cierre: '20:00' }
                        },
                        agent_name: 'BarberBot',
                        agent_personality: 'Friendly',
                        tipo_prestador: 'barbero',
                        tipo_prestador_label: 'Barbero',
                        slot_booking_mode: 'by_service'
                    }])
                    .select('id')
                    .single()

                if (sucErr) throw new Error(`Error creando sucursal ${acc.slug}: ${sucErr.message}`)
                sucursalId = newSuc.id
                results.push(`Sucursal ${acc.slug}: creada (${sucursalId})`)
            }

            // 2. Crear o actualizar admin
            const hash = await bcrypt.hash(acc.password, 10)

            const { data: existingAdmin } = await supabase
                .from('usuarios_admin')
                .select('id')
                .eq('email', acc.email)
                .maybeSingle()

            if (existingAdmin) {
                await supabase
                    .from('usuarios_admin')
                    .update({ password_hash: hash, sucursal_id: sucursalId, activo: true })
                    .eq('id', existingAdmin.id)
                results.push(`Admin ${acc.email}: contraseña actualizada`)
            } else {
                const { error: insErr } = await supabase
                    .from('usuarios_admin')
                    .insert([{
                        sucursal_id: sucursalId,
                        nombre: `Admin ${acc.plan}`,
                        email: acc.email,
                        password_hash: hash,
                        rol: 'admin',
                        activo: true
                    }])
                if (insErr) throw new Error(`Error creando admin ${acc.email}: ${insErr.message}`)
                results.push(`Admin ${acc.email}: creado`)
            }
        }

        return NextResponse.json({ success: true, results })
    } catch (error: any) {
        console.error('[test-apps/reset]', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
