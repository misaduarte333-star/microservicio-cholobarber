import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIsDemoMode } from '@/lib/supabase'

/**
 * Endpoint GET para obtener la lista de costos fijos de una sucursal para un mes específico.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const sucursal_id = searchParams.get('sucursal_id')
        const mes = searchParams.get('mes') // Format: 'YYYY-MM'

        if (!sucursal_id || !mes) {
            return NextResponse.json({ error: 'Faltan parámetros: sucursal_id y mes' }, { status: 400 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        let supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseServiceKey || supabaseServiceKey === 'your-service-role-key-here') {
            supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        }

        if (getIsDemoMode() || !supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json([]) // Demo mode fallback
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { data, error } = await supabase
            .from('costos_fijos')
            .select('*')
            .eq('sucursal_id', sucursal_id)
            .eq('mes', mes)
            .order('categoria', { ascending: true })

        if (error) throw error

        return NextResponse.json(data)
    } catch (error: any) {
        console.error('Error in costos-fijos GET:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/**
 * Endpoint POST para actualizar todos los costos fijos de una sucursal en un mes dado.
 * Elimina los registros anteriores del mes y los reemplaza con los nuevos datos enviados.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { sucursal_id, mes, costos } = body // costos: { categoria: string, monto: number }[]

        if (!sucursal_id || !mes || !Array.isArray(costos)) {
            return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        let supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supabaseServiceKey || supabaseServiceKey === 'your-service-role-key-here') {
            supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        }

        if (getIsDemoMode() || !supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json({ success: true, demo: true }) // Demo mode fallback
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Atomic replace: delete + insert in a single transaction via RPC
        const { error: rpcError } = await supabase.rpc('reemplazar_costos_fijos', {
            p_sucursal_id: sucursal_id,
            p_mes: mes,
            p_costos: costos
        })

        if (rpcError) {
            // Fallback: try non-transactional if RPC not available
            const { error: deleteError } = await supabase
                .from('costos_fijos')
                .delete()
                .eq('sucursal_id', sucursal_id)
                .eq('mes', mes)

            if (deleteError) throw deleteError

            if (costos.length > 0) {
                const { error: insertError } = await supabase
                    .from('costos_fijos')
                    .insert(costos.map((c: { categoria: string; monto: number }) => ({
                        sucursal_id, mes, categoria: c.categoria, monto: c.monto
                    })))

                if (insertError) throw insertError
            }
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error in costos-fijos POST:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
