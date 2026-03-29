import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * PATCH /api/sucursales
 * Actualiza la configuración de una sucursal.
 * Usa service_role para bypasear RLS.
 */
export async function PATCH(req: NextRequest) {
    try {
        const { id, ...updateData } = await req.json()

        if (!id) {
            return NextResponse.json({ error: 'ID de sucursal requerido' }, { status: 400 })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { data, error } = await supabase
            .from('sucursales')
            .update(updateData)
            .eq('id', id)
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, data })
    } catch (error) {
        console.error('Error updating sucursal:', error)
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
    }
}
