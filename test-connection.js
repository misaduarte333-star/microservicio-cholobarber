const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Testing connection with:');
console.log('URL:', url);
console.log('Key:', key ? (key.substring(0, 5) + '...') : 'undefined');

if (!url || !key || url.includes('your-project')) {
    console.log('❌ Error: Still using placeholder values or missing keys in .env.local');
    process.exit(1);
}

const supabase = createClient(url, key);

async function testConfig() {
    console.log(`\nAttempting to connect to Supabase...`);
    try {
        const { data, error } = await supabase.from('sucursales').select('*').limit(1);

        if (error) {
            console.error('❌ Connection failed:', error.message);
            if (error.code === 'PGRST301') {
                console.error('   Hint: This might be due to Row Level Security (RLS). But connection is established!');
            }
            process.exit(1);
        }

        console.log('✅ Connection successful!');
        console.log('   Data received:', data);
    } catch (err) {
        console.error('❌ Unexpected error:', err);
        process.exit(1);
    }
}

testConfig();
