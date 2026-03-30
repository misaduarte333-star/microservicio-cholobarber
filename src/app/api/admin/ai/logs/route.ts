import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const sucursalId = searchParams.get('sucursalId')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!sucursalId) {
        return NextResponse.json({ error: 'Sucursal ID required' }, { status: 400 })
    }

    try {
        const { data: logs, error } = await supabase
            .from('request_logs')
            .select('*')
            .like('session_id', `${sucursalId}:%`)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) throw error

        return NextResponse.json({ logs: logs || [] })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
