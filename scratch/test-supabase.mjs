import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Lee .env (no .env.local) manualmente
const envContent = fs.readFileSync('./.env', 'utf-8')
const env = {}
envContent.split('\n').forEach(line => {
    const parts = line.split('=')
    if (parts.length >= 2) {
        const key = parts[0].trim()
        const value = parts.slice(1).join('=').trim()
        if (key && !key.startsWith('#')) env[key] = value
    }
})

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY

console.log('✅ Testing .env (producción):')
console.log('URL:', url)
console.log('Key length:', key ? key.length : 0)

if (!url || !key) {
    console.error('❌ Missing credentials en .env')
    process.exit(1)
}

const supabase = createClient(url, key)

try {
    const { data: sucursales, error: errorSuc } = await supabase.from('sucursales').select('id, nombre').limit(2)
    if (errorSuc) {
        console.error('❌ Error fetching sucursales:', errorSuc.message)
    } else {
        console.log(`✅ sucursales OK — ${sucursales.length} filas`)
        sucursales.forEach(s => console.log(`   - ${s.nombre} (${s.id})`))
    }

    const { data: config, error: errorConf } = await supabase.from('configuracion_ia_global').select('id, default_provider').eq('id', 1).maybeSingle()
    if (errorConf) {
        console.error('❌ Error fetching configuracion_ia_global:', errorConf.message)
    } else {
        console.log(`✅ configuracion_ia_global OK — provider: ${config?.default_provider}`)
    }
} catch (e) {
    console.error('❌ Exception:', e)
}
