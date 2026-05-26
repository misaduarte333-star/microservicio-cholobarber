import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDevAuth } from '@/lib/auth'
import type { ConfigIA } from '@/lib/types.config-ia'

const supabaseUrl = process.env['SUPABASE_URL'] || process.env['NEXT_PUBLIC_SUPABASE_URL'] || ''
const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_KEY'] || process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || ''
const TABLE = 'configuracion_ia_global'

export async function GET(req: Request) {
    const auth = await requireDevAuth(req)
    if (!auth.authenticated) return auth.response!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .eq('id', 1)
            .single()

        const row = data as ConfigIA | null

        if (error && error.code !== 'PGRST116') {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const config = {
            evolution_api_url: row?.evolution_api_url || process.env.EVOLUTION_API_URL || '',
            evolution_api_key: row?.evolution_api_key || process.env.EVOLUTION_API_KEY || '',
            openai_api_key: row?.openai_api_key || process.env.OPENAI_API_KEY || '',
            anthropic_api_key: row?.anthropic_api_key || process.env.ANTHROPIC_API_KEY || '',
            groq_api_key: row?.groq_api_key || process.env.GROQ_API_KEY || '',
            default_provider: row?.default_provider || 'openai',
            openai_model: row?.openai_model || 'gpt-4o-mini',
            anthropic_model: row?.anthropic_model || 'claude-3-5-sonnet-20240620',
            groq_model: row?.groq_model || 'llama-3.1-70b-versatile'
        }

        return NextResponse.json({ config })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const auth = await requireDevAuth(req)
    if (!auth.authenticated) return auth.response!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    try {
        const body = await req.json()

        const input: Omit<ConfigIA, 'id'> = {
            evolution_api_url: body.evolution_api_url || null,
            evolution_api_key: body.evolution_api_key || null,
            openai_api_key: body.openai_api_key || null,
            anthropic_api_key: body.anthropic_api_key || null,
            groq_api_key: body.groq_api_key || null,
            default_provider: body.default_provider || 'openai',
            openai_model: body.openai_model || 'gpt-4o-mini',
            anthropic_model: body.anthropic_model || 'claude-3-5-sonnet-20240620',
            groq_model: body.groq_model || 'llama-3.1-70b-versatile'
        }

        const { data, error } = await supabase
            .from(TABLE)
            .upsert({ id: 1, ...input })
            .select()
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, config: data })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
