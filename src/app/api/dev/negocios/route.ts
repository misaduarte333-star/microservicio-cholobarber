import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /api/dev/negocios
 * Devuelve todas las sucursales con contadores y datos del admin.
 */
export async function GET() {
    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const [sucursalesRes, barberosRes, serviciosRes, citasRes, adminsRes] = await Promise.all([
            supabase.from('sucursales').select('*').order('created_at', { ascending: false }),
            supabase.from('barberos').select('id, sucursal_id, activo'),
            supabase.from('servicios').select('id, sucursal_id, activo'),
            supabase.from('citas').select('id, sucursal_id, created_at').order('created_at', { ascending: false }),
            supabase.from('usuarios_admin').select('id, sucursal_id, nombre, email, activo'),
        ])

        if (sucursalesRes.error) throw sucursalesRes.error

        const sucursales = (sucursalesRes.data || []).map(s => {
            const barberos = (barberosRes.data || []).filter(b => b.sucursal_id === s.id)
            const servicios = (serviciosRes.data || []).filter(sv => sv.sucursal_id === s.id)
            const citas = (citasRes.data || []).filter(c => c.sucursal_id === s.id)
            const admins = (adminsRes.data || []).filter(a => a.sucursal_id === s.id)
            const ultimaCita = citas[0]?.created_at || null

            return {
                ...s,
                _stats: {
                    barberos_activos: barberos.filter(b => b.activo).length,
                    barberos_total: barberos.length,
                    servicios_activos: servicios.filter(sv => sv.activo).length,
                    servicios_total: servicios.length,
                    citas_total: citas.length,
                    ultima_cita: ultimaCita,
                    admin_email: admins[0]?.email || null,
                    admin_nombre: admins[0]?.nombre || null,
                }
            }
        })

        return NextResponse.json({ success: true, sucursales })
    } catch (error: any) {
        console.error('Fetch negocios error:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const { 
            nombre, slug, plan, adminEmail, adminPassword, telefono_whatsapp,
            agent_name, agent_personality, agent_instance_name, agent_evolution_key,
            tipo_prestador, tipo_prestador_label
        } = await req.json()

        if (!nombre || !slug || !adminEmail || !adminPassword || !telefono_whatsapp) {
            return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 1. Crear Sucursal
        const { data: sucursal, error: sucError } = await supabase
            .from('sucursales')
            .insert([
                {
                    nombre,
                    slug,
                    plan,
                    telefono_whatsapp,
                    activa: true,
                    horario_apertura: {
                        lunes: { apertura: "09:00", cierre: "20:00" },
                        martes: { apertura: "09:00", cierre: "20:00" },
                        miercoles: { apertura: "09:00", cierre: "20:00" },
                        jueves: { apertura: "09:00", cierre: "20:00" },
                        viernes: { apertura: "09:00", cierre: "20:00" },
                        sabado: { apertura: "09:00", cierre: "20:00" }
                    },
                    agent_name,
                    agent_personality,
                    agent_instance_name,
                    agent_evolution_key,
                    agent_enabled: true,
                    tipo_prestador: tipo_prestador || 'barbero',
                    tipo_prestador_label: tipo_prestador_label || 'Barbero'
                }
            ])
            .select()
            .single()

        if (sucError) throw sucError

        // 2. Crear Administrador (via reset-password API logic or directly here)
        // For simplicity and to avoid dependency on another route, we can do it here
        // But we need bcrypt. Let's use the existing reset-password logic or just call it?
        // Actually, it's better to do the hash here to keep it atomic.
        
        const hash = await bcrypt.hash(adminPassword, 10)

        const { data: admin, error: adminError } = await supabase
            .from('usuarios_admin')
            .insert([
                {
                    sucursal_id: sucursal.id,
                    nombre: 'Administrador ' + nombre,
                    email: adminEmail.toLowerCase(),
                    password_hash: hash,
                    rol: 'admin',
                    activo: true
                }
            ])
            .select()
            .single()

        if (adminError) {
            // Rollback sucursal creation? 
            await supabase.from('sucursales').delete().eq('id', sucursal.id)
            throw adminError
        }

        return NextResponse.json({ success: true, sucursal, admin })
    } catch (error: any) {
        console.error('Create business error:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json()
        const { id, ...updates } = body

        if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        
        const { error } = await supabase
            .from('sucursales')
            .update(updates)
            .eq('id', id)

        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')
        if (!id) throw new Error('ID requerido')

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Proteger la sucursal del desarrollador
        const { data: suc } = await supabase.from('sucursales').select('slug').eq('id', id).single()
        if (suc?.slug === 'negocio-principal') {
            return NextResponse.json({ error: 'No se puede eliminar la sucursal principal del desarrollador' }, { status: 403 })
        }

        const { error } = await supabase.from('sucursales').delete().eq('id', id)
        if (error) throw error
        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
