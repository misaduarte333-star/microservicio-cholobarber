import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function run() {
    const publicEvoUrl = 'https://cholobot-evolution.ada8bf.easypanel.host'
    console.log('--- ACTUALIZANDO URL DE EVOLUTION ---')
    console.log('Nueva URL:', publicEvoUrl)

    const { error } = await supabase
        .from('configuracion_ia_global')
        .update({ evolution_api_url: publicEvoUrl })
        .eq('id', 1)
    
    if (error) {
        console.error('Error al actualizar:', error)
    } else {
        console.log('URL actualizada exitosamente en la DB.')
    }
}

run()
