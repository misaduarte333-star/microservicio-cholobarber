import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { requireDevAuth } from '@/lib/auth'

const supabaseUrl = process.env['SUPABASE_URL'] || process.env['NEXT_PUBLIC_SUPABASE_URL'] || ''
const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || ''

export async function POST(req: NextRequest) {
    const auth = await requireDevAuth(req)
    if (!auth.authenticated) return auth.response!

    try {
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

        for (const acc of testAccounts) {
            // 1. Check if sucursal exists
            let sucursalId: string
            const { data: existingSucursal } = await supabase
                .from('sucursales')
                .select('id')
                .eq('slug', acc.slug)
                .single()

            if (existingSucursal) {
                sucursalId = existingSucursal.id
                // Update plan just in case
                await supabase.from('sucursales').update({ plan: acc.plan }).eq('id', sucursalId)
            } else {
                const { data: newSucursal, error: sucErr } = await supabase
                    .from('sucursales')
                    .insert([{
                        nombre: acc.nombre,
                        slug: acc.slug,
                        plan: acc.plan,
                        telefono_whatsapp: '1234567890',
                        activa: true,
                        agent_enabled: false,
                        agent_active: false,
                        horario_apertura: {
                            lunes: { apertura: "09:00", cierre: "20:00" },
                            martes: { apertura: "09:00", cierre: "20:00" },
                            miercoles: { apertura: "09:00", cierre: "20:00" },
                            jueves: { apertura: "09:00", cierre: "20:00" },
                            viernes: { apertura: "09:00", cierre: "20:00" },
                            sabado: { apertura: "09:00", cierre: "20:00" }
                        },
                        agent_name: 'BarberBot',
                        agent_personality: 'Friendly',
                        tipo_prestador: 'barbero',
                        tipo_prestador_label: 'Barbero',
                        slot_booking_mode: 'by_service'
                    }])
                    .select('id')
                    .single()
                
                if (sucErr) throw sucErr
                sucursalId = newSucursal.id
            }

            // 2. Check if admin exists
            const { data: existingAdmin } = await supabase
                .from('usuarios_admin')
                .select('id')
                .eq('email', acc.email)
                .single()

            const hash = await bcrypt.hash(acc.password, 10)

            if (existingAdmin) {
                await supabase
                    .from('usuarios_admin')
                    .update({ password_hash: hash, sucursal_id: sucursalId })
                    .eq('id', existingAdmin.id)
            } else {
                await supabase
                    .from('usuarios_admin')
                    .insert([{
                        sucursal_id: sucursalId,
                        nombre: `Admin ${acc.plan}`,
                        email: acc.email,
                        password_hash: hash,
                        rol: 'admin',
                        activo: true
                    }])
            }
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error reset test apps:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
