import { Request, Response } from 'express';
import { AgentService } from '../ai-agent/agent.service';
import { MetricsService } from '../metrics/metrics.service';
import { envConfig } from '../../config/env.config';
import { BusinessContext } from '../businesses/business-context.interface';
import { logger } from '../../config/logger';

const agentService = new AgentService();

/** Fallback context for the /chat debug endpoint (no real tenant needed) */
function getDebugContext(): BusinessContext {
  return {
    sucursalId: 'debug',
    nombre: 'CholoBarber',
    agentName: 'CholoBot',
    personality: 'cholo-friendly',
    timezone: 'America/Hermosillo',
    greeting: '¡Que onda! Bienvenido a CholoBarber💈. ¿En qué te puedo ayudar?',
    evolution: {
      instance: envConfig.EVOLUTION_INSTANCE ?? 'barberia',
      url: envConfig.EVOLUTION_API_URL ?? '',
      key: envConfig.EVOLUTION_API_KEY ?? '',
    },
    llm: { provider: 'openai' },
  };
}

export class ChatController {
  public static async handle(req: Request, res: Response): Promise<void> {
    try {
      const { message, sessionId = 'test-session', senderPhone = 'test-phone' } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      if (typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({ error: 'Message must be a valid string' });
        return;
      }

      const sanitizedMessage = message.trim().substring(0, 1500).replace(/[<>&]/g, function (c) {
          switch (c) {
              case '<': return '&lt;';
              case '>': return '&gt;';
              case '&': return '&amp;';
              default: return c;
          }
      });

      logger.info({ sessionId, message: sanitizedMessage }, '💬 Chat Local');

      const start = Date.now();
      const { output, intermediateSteps } = await agentService.run(sessionId, sanitizedMessage, senderPhone, getDebugContext());
      const latencyMs = Date.now() - start;

      MetricsService.record({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        sessionId,
        phone: senderPhone,
        inputPreview: message.substring(0, 1000),
        outputPreview: output.substring(0, 1000),
        latencyMs,
        toolsUsed: (intermediateSteps || []).map((step: any) => ({
          name: step.action?.tool ?? 'unknown',
          input: step.action?.toolInput ?? {},
          output: String(step.observation ?? ''),
        })),
        source: 'chat',
      });

      res.json({
        response: output,
        steps: intermediateSteps
      });
    } catch (error) {
      console.error('❌ Error in chat controller:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
