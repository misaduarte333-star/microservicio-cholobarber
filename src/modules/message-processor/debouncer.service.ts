import { RedisService } from '../database/redis.service';
import { AgentService } from '../ai-agent/agent.service';
import { EvolutionService } from '../messaging/evolution.service';
import { MetricsService } from '../metrics/metrics.service';
import { logger } from '../../config/logger';

interface IncomeMessage {
  sessionId: string;
  senderPhone: string;
  pushName: string;
  text: string;     // Transcripción o texto directo
  timestamp: string;
}

export class DebouncerService {
  private redis = RedisService.getInstance();
  private agentService = new AgentService();
  private readonly DEBOUNCE_TIME_MS = 10000; // 10 segundos, igual que en n8n

  public async pushMessage(msg: IncomeMessage) {
    const listKey = `buffer:${msg.senderPhone}`;
    const timerKey = `timer:${msg.senderPhone}`;

    // Agregamos el mensaje al buffer
    await this.redis.rpush(listKey, JSON.stringify(msg));

    // Revisamos si ya existe un timer corriendo
    const hasTimer = await this.redis.get(timerKey);

    if (!hasTimer) {
      // Set timer flag para evitar lanzar multiples setTimeouts
      await this.redis.set(timerKey, 'running', 'EX', 15); // Expira un poco después del timeout

      // Iniciamos el ciclo de espera (no bloqueante para el request HTTP)
      setTimeout(() => this.processBuffer(msg.senderPhone), this.DEBOUNCE_TIME_MS);
    }
  }

  private readonly UNSENT_KEY_PREFIX = 'unsent:';

  private async processBuffer(phone: string) {
    const listKey = `buffer:${phone}`;
    const timerKey = `timer:${phone}`;
    const unsentKey = `${this.UNSENT_KEY_PREFIX}${phone}`;

    // Extraer todo el buffer atomicamente y limpiarlo
    const messages = await this.redis.lrange(listKey, 0, -1);
    await this.redis.del(listKey);
    await this.redis.del(timerKey);

    if (messages.length === 0) return;

    // Reenviar mensaje pendiente del turno anterior si no llegó a WhatsApp
    const unsentRaw = await this.redis.get(unsentKey);
    if (unsentRaw) {
      let unsent: any;
      try {
        unsent = JSON.parse(unsentRaw);
      } catch {
        logger.warn({ phone }, 'Dato unsent corrupto en Redis, descartando');
        await this.redis.del(unsentKey);
        unsent = null;
      }
      if (unsent?.text) {
        logger.warn({ phone, text: unsent.text }, 'Reenviando mensaje no entregado del turno anterior');
        const ok = await EvolutionService.sendText(phone, unsent.text);
        if (ok) {
          await this.redis.del(unsentKey);
          logger.info({ phone }, 'Mensaje pendiente reenviado con éxito');
        } else {
          logger.error({ phone }, 'No se pudo reenviar el mensaje pendiente');
        }
      }
    }

    // Concatenar el contenido — descartar mensajes corruptos en lugar de romper el batch
    const parsedMessages: IncomeMessage[] = messages.flatMap(m => {
      try { return [JSON.parse(m) as IncomeMessage]; } catch { return []; }
    });
    if (parsedMessages.length === 0) return;
    const combinedText = parsedMessages.map(m => m.text).join('\\n');
    const sessionId = parsedMessages[0].sessionId;

    logger.info({ phone, count: parsedMessages.length, text: combinedText }, 'Procesando batch de mensajes');

    const start = Date.now();
    try {
      await EvolutionService.sendPresence(phone, 'composing');

      const { output, intermediateSteps } = await this.agentService.run(sessionId, combinedText, phone, 'webhook');
      const latencyMs = Date.now() - start;
      logger.info({ phone, output }, 'Respuesta del agente lista');

      MetricsService.record({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        sessionId,
        phone,
        inputPreview: combinedText.substring(0, 1000),
        outputPreview: output.substring(0, 1000),
        latencyMs,
        toolsUsed: (intermediateSteps || []).map((step: any) => ({
          name: step.action?.tool ?? 'unknown',
          input: step.action?.toolInput ?? {},
          output: String(step.observation ?? ''),
        })),
        source: 'webhook',
      });

      // Guardar como pendiente antes de enviar; se elimina si llega bien
      await this.redis.set(unsentKey, JSON.stringify({ text: output, at: Date.now() }), 'EX', 3600);
      const sent = await EvolutionService.sendText(phone, output);
      if (sent) {
        await this.redis.del(unsentKey);
      } else {
        logger.error({ phone }, 'Mensaje guardado como pendiente para reenvío en el siguiente turno');
      }

    } catch (error: any) {
      MetricsService.record({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        sessionId,
        phone,
        inputPreview: combinedText.substring(0, 1000),
        outputPreview: '',
        latencyMs: Date.now() - start,
        toolsUsed: [],
        error: error?.message || String(error),
        source: 'webhook',
      });
      logger.error({ phone, err: error }, 'Error procesando agente');
      await EvolutionService.sendText(
        phone,
        'Lo siento, tuve un problema al procesar tu mensaje. Por favor intenta de nuevo en un momento.'
      );
    }
  }
}
