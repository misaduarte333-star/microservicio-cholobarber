
const Redis = require('ioredis');

const redisUrl = process.env.AGENT_REDIS_URL || 'redis://default:Redisaccess@18.216.112.9:6379';
const redis = new Redis(redisUrl);

async function clearManualModes() {
  try {
    const keys = await redis.keys('manual_mode:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Cleared ${keys.length} manual mode locks.`);
    } else {
        console.log('No manual_mode locks found.');
    }
  } catch (err) {
    console.error('Error clearing manual modes:', err);
  } finally {
    redis.quit();
  }
}

clearManualModes();
