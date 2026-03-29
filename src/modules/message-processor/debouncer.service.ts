import { RedisService } from '../database/redis.service';
import { AgentService } from '../ai-agent/agent.service';
import { EvolutionService } from '../messaging/evolution.service';
import { MetricsService } from '../metrics/metrics.service';
import { BusinessContext } from '../businesses/business-context.interface';
import { logger } from '../../config/logger';

interface IncomeMessage {
  sessionId: string;
  senderPhone: string;
  pushName: string;
  text: string;
  timestamp: string;
  businessCtx: BusinessContext;
}

export class DebouncerService {
  private redis = RedisService.getInstance();
  private agentService = new AgentService();
  private readonly DEBOUNCE_TIME_MS = 10000; // 10 s, same as original n8n flow

  public async pushMessage(msg: IncomeMessage) {
    // Keys are namespaced by sucursal_id to isolate tenants
    const listKey  = `buffer:${msg.businessCtx.sucursalId}:${msg.senderPhone}`;
    const timerKey = `timer:${msg.businessCtx.sucursalId}:${msg.senderPhone}`;

    await this.redis.rpush(listKey, JSON.stringify(msg));

    const hasTimer = await this.redis.get(timerKey);
    if (!hasTimer) {
      await this.redis.set(timerKey, 'running', 'EX', 15);
      setTimeout(
        () => this.processBuffer(msg.senderPhone, msg.businessCtx),
        this.DEBOUNCE_TIME_MS,
      );
    }
  }

  private readonly UNSENT_KEY_PREFIX = 'unsent:';

  private async processBuffer(phone: string, ctx: BusinessContext) {
    const listKey  = `buffer:${ctx.sucursalId}:${phone}`;
    const timerKey = `timer:${ctx.sucursalId}:${phone}`;
    const unsentKey = `${this.UNSENT_KEY_PREFIX}${ctx.sucursalId}:${phone}`;

    const messages = await this.redis.lrange(listKey, 0, -1);
    await this.redis.del(listKey);
    await this.redis.del(timerKey);

    if (messages.length === 0) return;

    // Resend pending message from previous turn if it never reached WhatsApp
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
        const ok = await EvolutionService.sendText(phone, unsent.text, ctx.evolution);
        if (ok) {
          await this.redis.del(unsentKey);
          logger.info({ phone }, 'Mensaje pendiente reenviado con éxito');
        } else {
          logger.error({ phone }, 'No se pudo reenviar el mensaje pendiente');
        }
      }
    }

    // Parse batch — discard corrupt entries instead of breaking the whole batch
    const parsedMessages: IncomeMessage[] = messages.flatMap(m => {
      try { return [JSON.parse(m) as IncomeMessage]; } catch { return []; }
    });
    if (parsedMessages.length === 0) return;

    const combinedText = parsedMessages.map(m => m.text).join('\n');
    // sessionId already namespaced as {sucursalId}:{phone} — set in webhook controller
    const sessionId = parsedMessages[0].sessionId;

    logger.info({ phone, sucursal: ctx.sucursalId, count: parsedMessages.length, text: combinedText }, 'Procesando batch de mensajes');

    const start = Date.now();
    try {
      await EvolutionService.sendPresence(phone, 'composing', ctx.evolution);

      const { output, intermediateSteps } = await this.agentService.run(sessionId, combinedText, phone, ctx);
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

      // Save as pending before sending; deleted on success
      await this.redis.set(unsentKey, JSON.stringify({ text: output, at: Date.now() }), 'EX', 3600);
      const sent = await EvolutionService.sendText(phone, output, ctx.evolution);
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
        'Lo siento, tuve un problema al procesar tu mensaje. Por favor intenta de nuevo en un momento.',
        ctx.evolution,
      );
    }
  }
}
