const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findCholoBarber() {
    const { data, error } = await supabase
        .from('sucursales')
        .select('id, nombre, slot_booking_mode')
        .ilike('nombre', '%Cholo%');
    
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    console.log('Cholo Barber branches:', data);
}

findCholoBarber();
