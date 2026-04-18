import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zzkryfmfoucxxmimrhyh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6a3J5Zm1mb3VjeHhtaW1yaHloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDY4MjI4OSwiZXhwIjoyMDg2MjU4Mjg5fQ.sGjaJYWmXfDVRXbFsta0eJ9Y7yW4hKTKuSpGfPASisE'; // From .env.local

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setupInstance() {
    console.log('Buscando negocio "Cholo Barber"...');
    
    // 1. Buscar la sucursal
    const { data: sucursales, error: fetchError } = await supabase
        .from('sucursales')
        .select('id, nombre, evolution_instance, agent_enabled')
        .ilike('nombre', '%Cholo Barber%');

    if (fetchError) {
        console.error('Error al buscar sucursal:', fetchError.message);
        return;
    }

    if (!sucursales || sucursales.length === 0) {
        console.warn('No se encontró ninguna sucursal con ese nombre.');
        return;
    }

    console.log('Sucursales encontradas:', sucursales);

    const target = sucursales[0];
    
    // 2. Actualizar la instancia
    console.log(`Actualizando sucursal ${target.nombre} (ID: ${target.id})...`);
    
    const { data: updated, error: updateError } = await supabase
        .from('sucursales')
        .update({
            evolution_instance: 'cholobarber',
            agent_enabled: true
        })
        .eq('id', target.id)
        .select();

    if (updateError) {
        console.error('Error al actualizar:', updateError.message);
        return;
    }

    console.log('Actualización exitosa:', updated);
}

setupInstance().catch(console.error);
