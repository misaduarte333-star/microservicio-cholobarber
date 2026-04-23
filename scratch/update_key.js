
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function update() {
  const { data, error } = await supabase
    .from('sucursales')
    .update({ 
      evolution_instance: 'cholobarber_v2',
      evolution_key: '46AB8DC1B217-4C73-96DA-78B8B4C2C729'
    })
    .eq('id', 'f07a7640-9d86-499f-a048-24109345787a')
    .select();

  if (error) {
    console.error('Error updating:', error);
  } else {
    console.log('Successfully updated Supabase:', data);
  }
}

update();
