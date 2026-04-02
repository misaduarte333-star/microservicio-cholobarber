import { createClient } from './src/lib/supabase';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkBarberos() {
    const supabase = createClient();
    const { data, error } = await supabase.from('barberos').select('id, nombre, horario_laboral').limit(1).single();
    if (error) {
        console.error('Error:', error);
    } else {
        console.dir(data, { depth: null });
    }
}

checkBarberos();
