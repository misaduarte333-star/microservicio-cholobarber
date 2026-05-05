import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function run() {
    console.log('--- CONFIGURACION GLOBAL IA ---')
    const { data: config, error } = await supabase
        .from('configuracion_ia_global')
        .select('*')
        .eq('id', 1)
        .single()
    
    if (error) {
        console.error('Error:', error)
        return
    }

    console.log(JSON.stringify(config, null, 2))
}

run()
