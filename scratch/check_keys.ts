import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function run() {
    const CHOLO_BARBER_ID = 'f07a7640-9d86-499f-a048-24109345787a'
    const { data, error } = await supabase
        .from('sucursales')
        .select('nombre, agent_evolution_key')
        .eq('id', CHOLO_BARBER_ID)
        .single()
    
    if (error) {
        console.error('Error fetching sucursal:', error.message)
        return
    }

    console.log('Sucursal:', data.nombre)
    console.log('API Key en Sucursal:', data.agent_evolution_key ? 'Configurada (empieza con ' + data.agent_evolution_key.substring(0, 5) + ')' : 'No configurada (usará la global)')
    
    const { data: config } = await supabase
        .from('configuracion_ia_global')
        .select('evolution_api_key')
        .eq('id', 1)
        .single()
    
    console.log('API Key Global:', config?.evolution_api_key ? 'Configurada (empieza con ' + config.evolution_api_key.substring(0, 5) + ')' : 'No configurada')
}

run()
