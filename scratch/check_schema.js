
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data, error } = await supabase
    .from('sucursales')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching sucursales:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns in sucursales:', Object.keys(data[0]));
  } else {
    console.log('No sucursales found.');
  }
}

checkSchema();
