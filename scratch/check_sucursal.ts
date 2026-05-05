import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CHOLO_BARBER_ID = 'f07a7640-9d86-499f-a048-24109345787a'

async function checkSucursal() {
    console.log('Checking Sucursal ID:', CHOLO_BARBER_ID)
    const { data, error } = await supabase
        .from('sucursales')
        .select('id, nombre, agent_instance_name, agent_enabled, agent_active')
        .eq('id', CHOLO_BARBER_ID)
        .single()

    if (error) {
        console.error('Error fetching sucursal:', error.message)
    } else {
        console.log('Sucursal Data:', data)
    }

    console.log('\nChecking all active sucursales with agent_instance_name:')
    const { data: all } = await supabase
        .from('sucursales')
        .select('id, nombre, agent_instance_name, agent_enabled, agent_active')
        .eq('agent_enabled', true)

    console.table(all)
}

checkSucursal()
