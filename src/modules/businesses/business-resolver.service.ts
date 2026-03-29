import { supabase } from '../database/supabase.service';
import { RedisService } from '../database/redis.service';
import { envConfig } from '../../config/env.config';
import { logger } from '../../config/logger';
import { BusinessContext } from './business-context.interface';

const CACHE_TTL_SECONDS = 600; // 10 min
const CACHE_KEY_PREFIX = 'biz:';

export class BusinessResolverService {
  private static redis = RedisService.getInstance();

  /**
   * Resolves a BusinessContext from an Evolution API instance name.
   * Results are cached in Redis for 10 minutes.
   * Returns null if the instance is unknown or agent_active = false.
   */
  public static async resolveByInstance(evolutionInstance: string): Promise<BusinessContext | null> {
    const cacheKey = `${CACHE_KEY_PREFIX}${evolutionInstance}`;

    // Try cache first
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as BusinessContext;
      }
    } catch (err) {
      logger.warn({ err, evolutionInstance }, 'Redis cache read failed, falling back to DB');
    }

    // Query Supabase
    const { data, error } = await supabase
      .from('sucursales')
      .select('*')
      .eq('evolution_instance', evolutionInstance)
      .eq('agent_active', true)
      .single();

    if (error || !data) {
      // Before returning null, try the env fallback for CholoBarber backward-compat
      if (
        evolutionInstance === envConfig.EVOLUTION_INSTANCE &&
        envConfig.EVOLUTION_API_URL &&
        envConfig.EVOLUTION_API_KEY
      ) {
        logger.warn({ evolutionInstance }, 'Instancia no en DB, usando fallback de .env (modo transición CholoBarber)');
        return this.buildFallbackContext(evolutionInstance);
      }
      logger.warn({ evolutionInstance, error: error?.message }, 'Instancia no reconocida o agente inactivo');
      return null;
    }

    const ctx: BusinessContext = {
      sucursalId: data.id,
      nombre: data.nombre,
      agentName: data.agent_name ?? 'Asistente',
      personality: data.agent_personality ?? 'friendly',
      timezone: data.timezone ?? 'America/Hermosillo',
      greeting: data.agent_greeting ?? undefined,
      customPrompt: data.agent_custom_prompt ?? undefined,
      evolution: {
        instance: data.evolution_instance,
        url: data.evolution_url ?? envConfig.EVOLUTION_API_URL ?? '',
        key: data.evolution_key ?? envConfig.EVOLUTION_API_KEY ?? '',
      },
      llm: {
        provider: (data.llm_provider as BusinessContext['llm']['provider']) ?? 'openai',
        model: data.llm_model ?? undefined,
        apiKey: data.llm_api_key ?? undefined,
      },
    };

    // Write to cache
    try {
      await this.redis.set(cacheKey, JSON.stringify(ctx), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn({ err }, 'Redis cache write failed');
    }

    return ctx;
  }

  /**
   * Invalidates the Redis cache for a given Evolution instance.
   * Call this after updating agent config via the admin API.
   */
  public static async invalidateCache(evolutionInstance: string): Promise<void> {
    try {
      await this.redis.del(`${CACHE_KEY_PREFIX}${evolutionInstance}`);
      logger.info({ evolutionInstance }, 'BusinessResolver cache invalidado');
    } catch (err) {
      logger.warn({ err, evolutionInstance }, 'No se pudo invalidar la cache del negocio');
    }
  }

  /** Fallback context built from global .env — used during CholoBarber transition */
  private static buildFallbackContext(evolutionInstance: string): BusinessContext {
    return {
      sucursalId: 'fallback',
      nombre: 'CholoBarber',
      agentName: 'CholoBot',
      personality: 'cholo-friendly',
      timezone: 'America/Hermosillo',
      greeting: '¡Que onda! Bienvenido a CholoBarber💈. ¿En qué te puedo ayudar?',
      evolution: {
        instance: evolutionInstance,
        url: envConfig.EVOLUTION_API_URL ?? '',
        key: envConfig.EVOLUTION_API_KEY ?? '',
      },
      llm: { provider: 'openai' },
    };
  }
}
