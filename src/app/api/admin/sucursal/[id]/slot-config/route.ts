import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * PATCH /api/admin/sucursal/[id]/slot-config
 * 
 * Configura el modo de carga de slots para una sucursal.
 * 
 * Body:
 * {
 *   "slot_booking_mode": "fixed_30min" | "fixed_1hour" | "by_service"
 * }
 */
export async function PATCH(
    request: Request,
    { params }: { params: { id: string } }
) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        const { id } = params
        const { slot_booking_mode } = await request.json()

        if (!id) {
            return NextResponse.json({ error: 'Falta ID de sucursal' }, { status: 400 })
        }

        if (!slot_booking_mode) {
            return NextResponse.json({ error: 'Falta slot_booking_mode' }, { status: 400 })
        }

        const validModes = ['fixed_30min', 'fixed_1hour', 'by_service']
        if (!validModes.includes(slot_booking_mode)) {
            return NextResponse.json({ 
                error: `slot_booking_mode debe ser uno de: ${validModes.join(', ')}`
            }, { status: 400 })
        }

        // Actualizar la sucursal
        const { data, error } = await supabase
            .from('sucursales')
            .update({ 
                slot_booking_mode,
                slot_config_updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select('id, nombre, slot_booking_mode, slot_config_updated_at')
            .single()

        if (error) {
            console.error('[SlotConfig] Error actualizar sucursal:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        console.log(`[SlotConfig] ✅ Sucursal ${id} actualizada: ${slot_booking_mode}`)

        return NextResponse.json({
            success: true,
            message: `Configuración de slots actualizada a: ${slot_booking_mode}`,
            data
        })

    } catch (error: any) {
        console.error('[SlotConfig] Error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/**
 * GET /api/admin/sucursal/[id]/slot-config
 * 
 * Obtiene la configuración actual de slots de una sucursal.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        const { id } = params

        if (!id) {
            return NextResponse.json({ error: 'Falta ID de sucursal' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('sucursales')
            .select('id, nombre, slot_booking_mode, slot_config_updated_at')
            .eq('id', id)
            .single()

        if (error) {
            console.error('[SlotConfig] Error obtener sucursal:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // También obtener duraciones de servicios para referencia
        const { data: servicios } = await supabase
            .from('servicios')
            .select('id, nombre, duracion_minutos')
            .eq('sucursal_id', id)
            .eq('activo', true)
            .order('nombre')

        return NextResponse.json({
            slot_config: data,
            servicios: servicios || [],
            info: {
                'fixed_30min': 'Todos los slots son 30 minutos',
                'fixed_1hour': 'Todos los slots son 1 hora',
                'by_service': 'Duración según el servicio seleccionado'
            }
        })

    } catch (error: any) {
        console.error('[SlotConfig] Error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
