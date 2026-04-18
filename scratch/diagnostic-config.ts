import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function diagnostic() {
    console.log('--- Configuración Global IA ---')
    const { data: configIa } = await supabase.from('configuracion_ia_global').select('*').single()
    console.log(JSON.stringify(configIa, null, 2))

    console.log('\n--- Cholo Barber Branch ---')
    const { data: sucursal } = await supabase.from('sucursales').select('*').eq('id', 'f07a7640-9d86-499f-a048-24109345787a').single()
    console.log(JSON.stringify(sucursal, null, 2))
}

diagnostic().catch(console.error)
