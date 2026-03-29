import { RedisService } from '../database/redis.service';
import { envConfig } from '../../config/env.config';

export type ProviderName = 'openai' | 'anthropic' | 'google';

export interface ProviderConfig {
  active: ProviderName;
  models: { openai: string; anthropic: string; google: string };
}

export type ErrorType = 'quota' | 'auth' | 'model' | 'connection';

export interface ProviderStatus {
  configured: boolean;
  ok: boolean | null;   // null = no probado aún
  latencyMs?: number;
  error?: string;
  errorType?: ErrorType;
  maskedKey?: string;   // primeros 12 chars + ***
  testedAt?: number;
  source?: 'test' | 'live'; // test = botón probar, live = mensaje real
}

const REDIS_CONFIG_KEY = 'cholobot:ai_provider';
const REDIS_KEY_PREFIX  = 'cholobot:api_key:';   // cholobot:api_key:openai, etc.
const REDIS_STATUS_PREFIX = 'cholobot:ai_status:'; // último resultado de test

const DEFAULTS: ProviderConfig = {
  active: 'openai',
  models: {
    openai:    'gpt-4o',
    anthropic: 'claude-opus-4-5',
    google:    'gemini-2.0-flash',
  },
};

export class ProviderService {
  private static redis = RedisService.getInstance();

  // ── Init ──────────────────────────────────────────────────────────────────

  /** Carga las API keys guardadas en Redis hacia process.env al arrancar.
   *  Necesario porque LangChain lee los env vars directamente. */
  static async syncEnvFromRedis(): Promise<void> {
    const providers: ProviderName[] = ['openai', 'anthropic', 'google'];
    await Promise.all(providers.map(async (provider) => {
      try {
        const key = await this.redis.get(`${REDIS_KEY_PREFIX}${provider}`);
        if (key) {
          if (provider === 'openai')    process.env.OPENAI_API_KEY    = key;
          if (provider === 'anthropic') process.env.ANTHROPIC_API_KEY = key;
          if (provider === 'google')    process.env.GOOGLE_API_KEY    = key;
        }
      } catch {}
    }));
  }

  // ── Config ────────────────────────────────────────────────────────────────

  static async getConfig(): Promise<ProviderConfig> {
    try {
      const raw = await this.redis.get(REDIS_CONFIG_KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULTS };
  }

  static async setActive(provider: ProviderName, model?: string): Promise<void> {
    const current = await this.getConfig();
    const updated: ProviderConfig = {
      ...current,
      active: provider,
      models: { ...current.models, ...(model ? { [provider]: model } : {}) },
    };
    await this.redis.set(REDIS_CONFIG_KEY, JSON.stringify(updated));
  }

  // ── API Keys ───────────────────────────────────────────────────────────────

  /** Guarda una API key en Redis y actualiza process.env para que LangChain la tome de inmediato */
  static async saveApiKey(provider: ProviderName, key: string): Promise<void> {
    await this.redis.set(`${REDIS_KEY_PREFIX}${provider}`, key);
    // LangChain lee los env vars directamente e ignora el parámetro openAIApiKey
    // cuando el env var está definido. Actualizamos process.env para que surta efecto
    // sin necesidad de redeploy.
    if (provider === 'openai')    process.env.OPENAI_API_KEY    = key;
    if (provider === 'anthropic') process.env.ANTHROPIC_API_KEY = key;
    if (provider === 'google')    process.env.GOOGLE_API_KEY    = key;
  }

  /** Obtiene la API key: Redis primero, luego env var */
  static async getApiKey(provider: ProviderName): Promise<string | undefined> {
    try {
      const fromRedis = await this.redis.get(`${REDIS_KEY_PREFIX}${provider}`);
      if (fromRedis) return fromRedis;
    } catch {}
    if (provider === 'openai')    return envConfig.OPENAI_API_KEY;
    if (provider === 'anthropic') return envConfig.ANTHROPIC_API_KEY;
    if (provider === 'google')    return envConfig.GOOGLE_API_KEY;
  }

  static mask(key: string): string {
    return key.substring(0, 12) + '•••••••••••••••';
  }

  static classifyError(message: string): ErrorType {
    const msg = message.toLowerCase();
    if (msg.includes('quota') || msg.includes('insufficient') || msg.includes('billing')
        || msg.includes('credit') || msg.includes('usage limit') || msg.includes('rate limit')
        || msg.includes('429') || msg.includes('overloaded')) return 'quota';
    if (msg.includes('api_key') || msg.includes('api key') || msg.includes('invalid_api')
        || msg.includes('authentication') || msg.includes('unauthorized') || msg.includes('401')
        || msg.includes('403') || msg.includes('permission')) return 'auth';
    if (msg.includes('model') || msg.includes('not found') || msg.includes('invalid_request')
        || msg.includes('400')) return 'model';
    return 'connection';
  }

  // ── Status ────────────────────────────────────────────────────────────────

  static async saveStatus(provider: ProviderName, status: Omit<ProviderStatus, 'configured' | 'maskedKey'>): Promise<void> {
    await this.redis.set(`${REDIS_STATUS_PREFIX}${provider}`, JSON.stringify({ ...status, testedAt: Date.now() }));
  }

  static async getStatus(provider: ProviderName): Promise<ProviderStatus> {
    const key = await this.getApiKey(provider);
    const configured = !!key;
    const maskedKey = key ? this.mask(key) : undefined;

    try {
      const raw = await this.redis.get(`${REDIS_STATUS_PREFIX}${provider}`);
      if (raw) {
        const s = JSON.parse(raw);
        return { configured, maskedKey, ...s };
      }
    } catch {}

    return { configured, maskedKey, ok: null };
  }

  static async getAllStatuses(): Promise<Record<ProviderName, ProviderStatus>> {
    const [openai, anthropic, google] = await Promise.all([
      this.getStatus('openai'),
      this.getStatus('anthropic'),
      this.getStatus('google'),
    ]);
    return { openai, anthropic, google };
  }

  // ── Test ──────────────────────────────────────────────────────────────────

  static async testProvider(provider: ProviderName, model: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const apiKey = await this.getApiKey(provider);
    if (!apiKey) {
      const result = { ok: false, latencyMs: 0, error: 'API key no configurada' };
      await this.saveStatus(provider, result);
      return result;
    }

    const start = Date.now();
    try {
      if (provider === 'openai') {
        const { ChatOpenAI } = await import('@langchain/openai');
        await new ChatOpenAI({ openAIApiKey: apiKey, modelName: model, maxTokens: 5 }).invoke('ping');
      } else if (provider === 'anthropic') {
        const { ChatAnthropic } = await import('@langchain/anthropic');
        const llm = new ChatAnthropic({ anthropicApiKey: apiKey, model, maxTokens: 5 });
        (llm as any).topP = undefined;
        await llm.invoke('ping');
      } else if (provider === 'google') {
        const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
        await new ChatGoogleGenerativeAI({ apiKey, model, maxOutputTokens: 5 }).invoke('ping');
      }
      const result = { ok: true, latencyMs: Date.now() - start };
      await this.saveStatus(provider, result);
      return result;
    } catch (e: any) {
      const result = { ok: false, latencyMs: Date.now() - start, error: e.message, errorType: this.classifyError(e.message), source: 'test' as const };
      await this.saveStatus(provider, result);
      return result;
    }
  }

  static async reportLiveError(provider: ProviderName, error: string): Promise<void> {
    const existing = await this.getStatus(provider);
    await this.saveStatus(provider, {
      ok: false,
      latencyMs: existing.latencyMs,
      error,
      errorType: this.classifyError(error),
      source: 'live',
    });
  }
}
