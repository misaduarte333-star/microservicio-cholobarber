const Redis = require('ioredis');
require('dotenv').config({ path: '.env.local' });

const url = process.env.AGENT_REDIS_URL;
console.log('Testing Redis connection to:', url);

const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000
});

redis.on('error', (err) => {
    console.error('Redis error:', err);
});

redis.set('test-key', 'working', (err) => {
    if (err) {
        console.error('Failed to set key:', err);
    } else {
        console.log('Successfully set test-key');
        redis.get('test-key', (err, result) => {
            console.log('Result:', result);
            process.exit(0);
        });
    }
});
