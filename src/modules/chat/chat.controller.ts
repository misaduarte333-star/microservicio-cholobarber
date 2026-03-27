import { Request, Response } from 'express';
import { AgentService } from '../ai-agent/agent.service';
import { MetricsService } from '../metrics/metrics.service';
import { logger } from '../../config/logger';

const agentService = new AgentService();

export class ChatController {
  public static async handle(req: Request, res: Response): Promise<void> {
    try {
      const { message, sessionId = 'test-session', senderPhone = 'test-phone' } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      if (typeof message !== 'string' || message.length > 2000) {
        res.status(400).json({ error: 'Message must be a string under 2000 characters' });
        return;
      }

      logger.info({ sessionId, message }, '💬 Chat Local');

      const start = Date.now();
      const { output, intermediateSteps } = await agentService.run(sessionId, message, senderPhone);
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
