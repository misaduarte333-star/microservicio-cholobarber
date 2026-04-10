import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const { data, error } = await supabase
        .from('sucursales')
        .select('id, nombre, agent_name, agent_personality, agent_custom_prompt, tipo_prestador, tipo_prestador_label')
        .eq('id', id)
        .single()

    if (error || !data) {
        return NextResponse.json({ error: 'Sucursal no encontrada' }, { status: 404 })
    }

    return NextResponse.json(data)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const body = await req.json()

    const { customPrompt } = body

    if (customPrompt === undefined) {
        return NextResponse.json({ error: 'customPrompt is required' }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('sucursales')
        .update({
            agent_custom_prompt: customPrompt,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
}
