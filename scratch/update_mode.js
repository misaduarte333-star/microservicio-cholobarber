const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function updateMode() {
    const { data, error } = await supabase
        .from('sucursales')
        .update({ slot_booking_mode: 'fixed_30min' })
        .eq('id', 'f07a7640-9d86-499f-a048-24109345787a')
        .select();
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    console.log('Update successful:', data);
}

updateMode();
