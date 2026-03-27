import Redis from 'ioredis';
import { envConfig } from '../../config/env.config';
import { logger } from '../../config/logger';

export class RedisService {
  private static instance: Redis;

  public static getInstance(): Redis {
    if (!this.instance) {
      if (envConfig.MOCK_MODE) {
        logger.info('Redis MOCK MODE activado (In-Memory)');
        const store: Record<string, string[]> = {};
        const timers: Record<string, any> = {};
        
        this.instance = {
          rpush: async (key: string, val: string) => { 
            if(!store[key]) store[key] = []; 
            store[key].push(val); 
          },
          get: async (key: string) => timers[key] || null,
          set: async (key: string, val: string, ex?: string, time?: number) => { 
            timers[key] = val; 
            if (ex === 'EX' && time) setTimeout(() => delete timers[key], time * 1000);
          },
          lrange: async (key: string, start: number, end: number) => store[key] || [],
          del: async (key: string) => { delete store[key]; delete timers[key]; }
        } as unknown as Redis;
      } else {
        this.instance = new Redis(envConfig.REDIS_URL!);
        this.instance.on('connect', () => logger.info('Redis conectado'));
        this.instance.on('error', (err) => logger.error({ err }, 'Redis error'));
      }
    }
    return this.instance;
  }
}
