import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * GET /api/dev/config-ia
 * Returns the global AI configuration
 */
export async function GET() {
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)
    
    try {
        const { data, error } = await supabase
            .from('configuracion_ia_global')
            .select('*')
            .eq('id', 1)
            .single()

        if (error && error.code !== 'PGRST116') {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ config: data || null })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

/**
 * POST /api/dev/config-ia
 * Updates the global AI configuration
 */
export async function POST(req: Request) {
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey)
    
    try {
        const body = await req.json()
        
        const input: Database['public']['Tables']['configuracion_ia_global']['Insert'] = {
            id: 1,
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
            .from('configuracion_ia_global')
            .upsert(input as any)
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
