const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
    'https://zzkryfmfoucxxmimrhyh.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'zzkryfmfoucxxmimrhyh' // Fallback to ID if key not in env, but better to use the one from .env
)

async function check() {
    const { data, error } = await supabase.from('sucursales').select('id, nombre, agent_instance_name, agent_enabled')
    if (error) console.error(error)
    else console.table(data)
}

check()
