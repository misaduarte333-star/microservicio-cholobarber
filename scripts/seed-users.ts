import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

console.log('🔗 URL:', supabaseUrl)
console.log('🔑 Key (primeros 10 chars):', supabaseKey?.substring(0, 10))

const supabase = createClient(supabaseUrl, supabaseKey)

async function seed() {
    console.log('--- Iniciando Seed de Usuarios ---')

    // 1. Encriptar contraseña
    const password = 'admin123'
    const salt = await bcrypt.genSalt(10)
    const hash = await bcrypt.hash(password, salt)
    console.log('✅ Contraseña "admin123" encriptada correctamente.')

    // 2. Obtener o crear sucursal
    let sucursalId: string
    const { data: sucursales, error: sucError } = await supabase
        .from('sucursales')
        .select('id')
        .limit(1)

    if (sucError) {
        console.error('❌ Error buscando sucursales:', sucError)
        return
    }

    if (sucursales && sucursales.length > 0) {
        sucursalId = sucursales[0].id
        console.log(`📍 Usando sucursal existente (ID: ${sucursalId})`)
    } else {
        console.log('📍 No hay sucursales. Creando sucursal de prueba...')
        const { data: newSuc, error: createError } = await supabase
            .from('sucursales')
            .insert({
                nombre: 'Sucursal Principal',
                telefono_whatsapp: '5210000000000',
                horario_apertura: { Lunes: "09:00-19:00" },
                activa: true
            })
            .select()
            .single()

        if (createError) {
            console.error('❌ Error creando sucursal:', createError)
            return
        }
        sucursalId = newSuc.id
        console.log(`✅ Sucursal creada (ID: ${sucursalId})`)
    }

    // 3. Crear usuarios
    const usersToCreate = [
        {
            email: 'admin@barbercloud.com',
            nombre: 'Administrador Maestro',
            rol: 'admin'
        },
        {
            email: 'Nails_Art@gmail.com',
            nombre: 'Nails Art User',
            rol: 'admin' // Cambiar a 'secretaria' si se prefiere otro rol
        }
    ]

    for (const u of usersToCreate) {
        console.log(`👤 Procesando usuario: ${u.email}...`)
        
        const { data: existing } = await supabase
            .from('usuarios_admin')
            .select('id')
            .eq('email', u.email)
            .maybeSingle()

        if (existing) {
            const { error: updError } = await supabase
                .from('usuarios_admin')
                .update({
                    password_hash: hash,
                    nombre: u.nombre,
                    rol: u.rol,
                    sucursal_id: sucursalId,
                    activo: true
                })
                .eq('id', existing.id)
            
            if (updError) console.error(`❌ Error actualizando ${u.email}:`, updError)
            else console.log(`✅ Usuario ${u.email} actualizado.`)
        } else {
            const { error: insError } = await supabase
                .from('usuarios_admin')
                .insert({
                    email: u.email,
                    nombre: u.nombre,
                    password_hash: hash,
                    rol: u.rol,
                    sucursal_id: sucursalId,
                    activo: true
                })
            
            if (insError) console.error(`❌ Error insertando ${u.email}:`, insError)
            else console.log(`✅ Usuario ${u.email} creado.`)
        }
    }

    console.log('--- Seed Finalizado con Éxito ---')
}

seed().catch(console.error)
