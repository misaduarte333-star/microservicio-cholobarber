import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function run() {
    console.log('--- DIAGNOSTICO DE INSTANCIAS ---')
    const { data: sucursales, error } = await supabase
        .from('sucursales')
        .select('id, nombre, agent_instance_name, agent_enabled, agent_active')
    
    if (error) {
        console.error('Error:', error)
        return
    }

    console.log('Sucursales en DB:')
    sucursales.forEach(s => {
        console.log(`- [${s.id}] Name: ${s.nombre} | Instance: ${s.agent_instance_name} | Enabled: ${s.agent_enabled} | Active: ${s.agent_active}`)
    })

    const CHOLO_BARBER_ID = 'f07a7640-9d86-499f-a048-24109345787a'
    const cholo = sucursales.find(s => s.id === CHOLO_BARBER_ID)
    if (cholo) {
        console.log('\nConfiguración específica para Cholo Barber:')
        console.log(JSON.stringify(cholo, null, 2))
    } else {
        console.log('\n¡ADVERTENCIA! El ID de Cholo Barber hardcodeado en el webhook no existe en la tabla sucursales.')
    }
}

run()
