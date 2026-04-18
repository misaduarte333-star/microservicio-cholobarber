import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://zzkryfmfoucxxmimrhyh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6a3J5Zm1mb3VjeHhtaW1yaHloIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDY4MjI4OSwiZXhwIjoyMDg2MjU4Mjg5fQ.sGjaJYWmXfDVRXbFsta0eJ9Y7yW4hKTKuSpGfPASisE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSucursales() {
    const { data: sucursales, error } = await supabase
        .from('sucursales')
        .select('id, nombre, evolution_instance, agent_enabled');

    if (error) {
        console.error('Error fetching sucursales:', error.message);
        return;
    }

    console.log('Sucursales en la DB:');
    sucursales.forEach(s => {
        console.log(`- [${s.id}] ${s.nombre} | Instancia: ${s.evolution_instance} | Agente: ${s.agent_enabled}`);
    });
}

checkSucursales().catch(console.error);
