import { envConfig } from '../../config/env.config';
import { logger } from '../../config/logger';

export class EvolutionService {
  /**
   * Envía el indicador de "escribiendo..." en WhatsApp.
   * @param presence 'composing' = escribiendo | 'paused' = dejó de escribir
   */
  public static async sendPresence(phone: string, presence: 'composing' | 'paused' = 'composing') {
    if (envConfig.MOCK_MODE) {
      logger.info({ phone, presence }, '[MOCK] WhatsApp sendPresence');
      return;
    }

    try {
      const response = await fetch(`${envConfig.EVOLUTION_API_URL}/chat/sendPresence/${envConfig.EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': envConfig.EVOLUTION_API_KEY || '',
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

  public static async sendText(phone: string, text: string, retries = 2): Promise<boolean> {
    if (envConfig.MOCK_MODE) {
      logger.info({ phone, text }, '[MOCK] WhatsApp sendText');
      return true;
    }

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        const response = await fetch(`${envConfig.EVOLUTION_API_URL}/message/sendText/${envConfig.EVOLUTION_INSTANCE}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': envConfig.EVOLUTION_API_KEY || '',
          },
          body: JSON.stringify({ number: phone, text }),
        });

        if (response.ok) return true;

        const body = await response.text();
        logger.warn({ phone, attempt, status: response.status, body }, 'sendText falló, reintentando...');
      } catch (error) {
        logger.warn({ phone, attempt, err: error }, 'sendText error de red, reintentando...');
      }

      if (attempt <= retries) await new Promise(r => setTimeout(r, 1500 * attempt));
    }

    logger.error({ phone }, 'sendText falló tras todos los reintentos');
    return false;
  }

  public static async sendMedia(phone: string, imageUrl: string, caption: string) {
    if (envConfig.MOCK_MODE) {
      logger.info({ phone, imageUrl, caption }, '[MOCK] WhatsApp sendMedia');
      return;
    }

    try {
      const response = await fetch(`${envConfig.EVOLUTION_API_URL}/message/sendMedia/${envConfig.EVOLUTION_INSTANCE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': envConfig.EVOLUTION_API_KEY || '',
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
        logger.error({ phone, status: response.status, body: await response.text() }, 'Failed to send media to Evolution API');
      }
    } catch (error) {
      logger.error({ phone, err: error }, 'Error in EvolutionService.sendMedia');
    }
  }
}
