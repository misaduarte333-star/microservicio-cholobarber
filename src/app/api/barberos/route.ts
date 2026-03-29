import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * POST /api/barberos
 * Crea un nuevo barbero.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { sucursal_id, ...barberoData } = body

        if (!sucursal_id) {
            return NextResponse.json({ error: 'sucursal_id requerido' }, { status: 400 })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { data, error } = await supabase
            .from('barberos')
            .insert([{ ...barberoData, sucursal_id }])
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, data })
    } catch (error: any) {
        console.error('Error creating barbero:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}

/**
 * PATCH /api/barberos
 * Actualiza un barbero existente.
 */
export async function PATCH(req: NextRequest) {
    try {
        const { id, ...updateData } = await req.json()

        if (!id) {
            return NextResponse.json({ error: 'ID de barbero requerido' }, { status: 400 })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { data, error } = await supabase
            .from('barberos')
            .update(updateData)
            .eq('id', id)
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, data })
    } catch (error: any) {
        console.error('Error updating barbero:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}

/**
 * DELETE /api/barberos?id=xxx
 * Elimina un barbero.
 */
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')
        if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { error } = await supabase.from('barberos').delete().eq('id', id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
