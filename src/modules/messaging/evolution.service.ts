import { envConfig } from '../../config/env.config';
import { logger } from '../../config/logger';
import { EvolutionConfig } from '../businesses/business-context.interface';

/** Fallback config from .env — used by health checks and legacy callers */
function globalConfig(): EvolutionConfig {
  return {
    instance: envConfig.EVOLUTION_INSTANCE ?? '',
    url:      envConfig.EVOLUTION_API_URL ?? '',
    key:      envConfig.EVOLUTION_API_KEY ?? '',
  };
}

// --- Circuit Breaker Básico ---
const CB_MAX_FAILURES = 4;
const CB_RESET_TIMEOUT_MS = 15000;
let cbFailures = 0;
let cbOpenUntil = 0;

function checkCircuit() {
  if (cbFailures >= CB_MAX_FAILURES) {
    if (Date.now() < cbOpenUntil) {
      throw new Error(`Circuit Breaker Abierto: Evolution API suspendida por continuos fallos de red`);
    } else {
      cbFailures = CB_MAX_FAILURES - 1; // Half-open
    }
  }
}

function recordFailure(status?: number) {
  // Solo abrir circuito ante caídas de red o 5xx, no por 400s de cliente
  if (status && status < 500) return;
  cbFailures++;
  if (cbFailures >= CB_MAX_FAILURES) {
    cbOpenUntil = Date.now() + CB_RESET_TIMEOUT_MS;
    logger.error(`Evolution API caída - Circuit Breaker abierto por ${CB_RESET_TIMEOUT_MS/1000}s`);
  }
}

function recordSuccess() {
  if (cbFailures > 0) cbFailures = 0;
}
// ----------------------------

export class EvolutionService {
  /**
   * Sends the "typing…" indicator on WhatsApp.
   * @param presence 'composing' = typing | 'paused' = stopped typing
   */
  public static async sendPresence(
    phone: string,
    presence: 'composing' | 'paused' = 'composing',
    config?: EvolutionConfig,
  ): Promise<void> {
    const { url, key, instance } = config ?? globalConfig();

    if (envConfig.MOCK_MODE) {
      logger.info({ phone, presence }, '[MOCK] WhatsApp sendPresence');
      return;
    }

    try {
      const response = await fetch(`${url}/chat/sendPresence/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
        },
        body: JSON.stringify({ number: phone, presence, delay: 8000 }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn({ phone, presence, status: response.status }, 'sendPresence falló (no crítico)');
      }
    } catch (error) {
      logger.warn({ phone, err: error }, 'Error en EvolutionService.sendPresence (no crítico)');
    }
  }

  public static async sendText(
    phone: string,
    text: string,
    config?: EvolutionConfig,
    retries = 2,
  ): Promise<boolean> {
    const { url, key, instance } = config ?? globalConfig();

    if (envConfig.MOCK_MODE) {
      logger.info({ phone, text }, '[MOCK] WhatsApp sendText');
      return true;
    }

    try {
      checkCircuit();
    } catch (cbError: any) {
      logger.error({ phone }, cbError.message);
      return false;
    }

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        const response = await fetch(`${url}/message/sendText/${instance}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': key,
          },
          body: JSON.stringify({ number: phone, text }),
        });

        if (response.ok) {
          recordSuccess();
          return true;
        }

        const body = await response.text();
        logger.warn({ phone, attempt, status: response.status, body }, 'sendText falló, reintentando...');
        recordFailure(response.status);
      } catch (error) {
        logger.warn({ phone, attempt, err: error }, 'sendText error de red, reintentando...');
        recordFailure();
      }

      if (attempt <= retries) await new Promise(r => setTimeout(r, 1500 * attempt));
    }

    logger.error({ phone }, 'sendText falló tras todos los reintentos');
    return false;
  }

  public static async sendMedia(
    phone: string,
    imageUrl: string,
    caption: string,
    config?: EvolutionConfig,
  ): Promise<void> {
    const { url, key, instance } = config ?? globalConfig();

    if (envConfig.MOCK_MODE) {
      logger.info({ phone, imageUrl, caption }, '[MOCK] WhatsApp sendMedia');
      return;
    }

    try {
      checkCircuit();
    } catch (cbError: any) {
      logger.error({ phone }, cbError.message);
      return;
    }

    try {
      const response = await fetch(`${url}/message/sendMedia/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
        },
        body: JSON.stringify({
          number: phone,
          mediatype: 'image',
          media: imageUrl,
          caption,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        logger.error({ phone, status: response.status, body: await response.text() }, 'Error al enviar multimedia por Evolution API');
        recordFailure(response.status);
      } else {
        recordSuccess();
      }
    } catch (error) {
      logger.error({ phone, err: error }, 'Error en EvolutionService.sendMedia');
      recordFailure();
    }
  }
}
