import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { envConfig } from './config/env.config';
import { logger } from './config/logger';
import { WebhookController } from './modules/webhook/webhook.controller';
import { ChatController } from './modules/chat/chat.controller';
import { MetricsController } from './modules/metrics/metrics.controller';
import { MetricsService } from './modules/metrics/metrics.service';
import { HealthService } from './modules/metrics/health.service';
import { ProviderController } from './modules/config/provider.controller';

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://cholobarber.com', /\.cholobarber\.com$/]
    : true,
  methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '1mb' }));

// Auth middleware — activo solo si DASHBOARD_TOKEN está definido en el env
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = envConfig.DASHBOARD_TOKEN;
  if (!token) return next(); // Sin token configurado = modo desarrollo, sin restricción

  // Soporte para Bearer token en header o ?token= en query string
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;
  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

  if (provided === token) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.use(express.static(path.join(__dirname, '..', 'public')));

// Rate limiter: protege /webhook de abuso — limitado por número de teléfono, no por IP
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
  keyGenerator: (req) => {
    const phone = req.body?.data?.key?.remoteJid ?? req.body?.data?.sender;
    return phone || req.ip || 'unknown';
  },
  skip: (req) => !req.body?.data,
});

// Rate limiter para /chat — debug endpoint, no debe recibir más de 20 req/min por IP
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

// Rate limiter para /api/metrics — lecturas frecuentes desde el dashboard
const metricsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/webhook', webhookLimiter, WebhookController.handle);
app.post('/chat', chatLimiter, ChatController.handle);

// Métricas y monitoreo
app.get('/api/metrics/stats', metricsLimiter, MetricsController.getStats);
app.get('/api/metrics/logs', metricsLimiter, MetricsController.getLogs);
app.get('/api/metrics/conversations', metricsLimiter, MetricsController.getConversations);
app.get('/api/metrics/session/:sessionId', metricsLimiter, MetricsController.getSessionLogs);
app.get('/api/health', metricsLimiter, MetricsController.getHealth);
app.post('/api/webhook/configure', requireAuth, MetricsController.configureWebhook);
app.get('/api/config/provider', requireAuth, ProviderController.getConfig);
app.post('/api/config/provider', requireAuth, ProviderController.setActive);
app.post('/api/config/provider/key', requireAuth, ProviderController.saveKey);
app.post('/api/config/provider/test', requireAuth, ProviderController.testProvider);
app.get('/', (_req, res) => res.redirect('/app.html'));
app.get('/dashboard', (_req, res) => res.redirect('/app.html'));
app.get('/providers', (_req, res) => res.redirect('/app.html'));

async function autoConfigureNgrokWebhook() {
  const ngrokApiUrl = process.env.NGROK_API_URL;
  if (!ngrokApiUrl) return;

  logger.info('Esperando ngrok...');
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const res = await fetch(`${ngrokApiUrl}/api/tunnels`);
      if (!res.ok) continue;
      const data: any = await res.json();
      const tunnel = data.tunnels?.find((t: any) => t.proto === 'https');
      if (!tunnel) continue;

      const tunnelUrl = tunnel.public_url;
      const result = await HealthService.configureWebhook(tunnelUrl);
      if (result.ok) {
        logger.info({ url: tunnelUrl }, 'Webhook configurado automáticamente via ngrok');
      } else {
        logger.warn({ msg: result.message }, 'No se pudo configurar webhook ngrok');
      }
      return;
    } catch {
      // ngrok aún no está listo
    }
  }
  logger.warn('ngrok no respondió en 30s, omitiendo auto-configure');
}

const PORT = envConfig.PORT || 3000;

const server = app.listen(PORT, async () => {
  logger.info({ port: PORT }, 'CholoBot Microservice iniciado');
  await MetricsService.init();
  autoConfigureNgrokWebhook().catch(err =>
    logger.warn({ err }, 'autoConfigureNgrokWebhook falló')
  );
});

// Graceful shutdown — Docker/Kubernetes envía SIGTERM antes de matar el contenedor
function shutdown(signal: string) {
  logger.info({ signal }, 'Señal recibida, cerrando servidor...');
  server.close(() => {
    logger.info('Servidor HTTP cerrado. Saliendo.');
    process.exit(0);
  });
  // Forzar salida si tarda más de 10s
  setTimeout(() => {
    logger.error('Shutdown forzado tras timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
