import { RedisService } from '../database/redis.service';
import { supabase } from '../database/supabase.service';
import { envConfig } from '../../config/env.config';

export interface ServiceHealth {
  status: 'ok' | 'error';
  latencyMs?: number;
  message?: string;
}

export class HealthService {
  static async check(): Promise<Record<string, ServiceHealth>> {
    const results: Record<string, ServiceHealth> = {};

    // Redis
    try {
      const start = Date.now();
      const redis = RedisService.getInstance();
      await redis.set('_healthcheck', '1', 'EX', 5);
      results.redis = { status: 'ok', latencyMs: Date.now() - start };
    } catch (e: any) {
      results.redis = { status: 'error', message: e.message };
    }

    // Supabase
    try {
      const start = Date.now();
      const { error } = await supabase.from('citas').select('id').limit(1);
      results.supabase = error
        ? { status: 'error', message: error.message }
        : { status: 'ok', latencyMs: Date.now() - start };
    } catch (e: any) {
      results.supabase = { status: 'error', message: e.message };
    }

    // Evolution API
    if (envConfig.EVOLUTION_API_URL) {
      try {
        const start = Date.now();
        const res = await fetch(`${envConfig.EVOLUTION_API_URL}/`, {
          signal: AbortSignal.timeout(5000),
        });
        results.evolution = {
          status: res.ok ? 'ok' : 'error',
          latencyMs: Date.now() - start,
          message: res.ok ? undefined : `HTTP ${res.status}`,
        };
      } catch (e: any) {
        results.evolution = { status: 'error', message: e.message };
      }
    } else {
      results.evolution = { status: 'error', message: 'EVOLUTION_API_URL no configurado' };
    }

    return results;
  }

  static async configureWebhook(tunnelUrl: string): Promise<{ ok: boolean; message: string }> {
    if (!envConfig.EVOLUTION_API_URL || !envConfig.EVOLUTION_API_KEY || !envConfig.EVOLUTION_INSTANCE) {
      return { ok: false, message: 'Faltan variables: EVOLUTION_API_URL, EVOLUTION_API_KEY o EVOLUTION_INSTANCE' };
    }

    const webhookUrl = `${tunnelUrl.replace(/\/$/, '')}/webhook`;

    try {
      const res = await fetch(
        `${envConfig.EVOLUTION_API_URL}/webhook/set/${envConfig.EVOLUTION_INSTANCE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': envConfig.EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              webhookBase64: false,
              events: ['MESSAGES_UPSERT'],
            },
          }),
          signal: AbortSignal.timeout(8000),
        }
      );

      const body = await res.text();
      if (res.ok) {
        return { ok: true, message: `Webhook configurado: ${webhookUrl}` };
      }
      return { ok: false, message: `Evolution API error ${res.status}: ${body}` };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  }
}
