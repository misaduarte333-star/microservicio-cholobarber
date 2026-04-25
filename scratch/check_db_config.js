const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkConfig() {
    const { data, error } = await supabase
        .from('configuracion_ia_global')
        .select('*')
        .eq('id', 1)
        .single();
    
    if (error) {
        console.error('Error fetching config:', error);
    } else {
        console.log('Current DB Config:', JSON.stringify(data, null, 2));
    }
}

checkConfig();
