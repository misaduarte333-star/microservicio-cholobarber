import { createClient } from './src/lib/supabase';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkSucursal() {
    const supabase = createClient();
    const { data, error } = await supabase.from('sucursales').select('id, nombre, horario_apertura').limit(1).single();
    if (error) {
        console.error('Error:', error);
    } else {
        console.dir(data, { depth: null });
    }
}

checkSucursal();
