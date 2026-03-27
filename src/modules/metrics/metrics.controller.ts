import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import { HealthService } from './health.service';

export class MetricsController {
  static getStats(_req: Request, res: Response) {
    res.json(MetricsService.getStats());
  }

  static getLogs(req: Request, res: Response) {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    res.json(MetricsService.getLogs(limit));
  }

  static getConversations(_req: Request, res: Response) {
    res.json(MetricsService.getConversations());
  }

  static getSessionLogs(req: Request, res: Response) {
    const { sessionId } = req.params;
    res.json(MetricsService.getSessionLogs(sessionId as string));
  }

  static async getHealth(_req: Request, res: Response) {
    const services = await HealthService.check();
    const allOk = Object.values(services).every(h => h.status === 'ok');
    res.status(allOk ? 200 : 207).json({ status: allOk ? 'ok' : 'degraded', services });
  }

  static async configureWebhook(req: Request, res: Response) {
    try {
      const { tunnelUrl } = req.body;
      if (!tunnelUrl) {
        res.status(400).json({ ok: false, message: 'tunnelUrl requerido' });
        return;
      }
      const result = await HealthService.configureWebhook(tunnelUrl);
      res.status(result.ok ? 200 : 500).json(result);
    } catch (e: any) {
      res.status(500).json({ ok: false, message: e.message });
    }
  }
}
