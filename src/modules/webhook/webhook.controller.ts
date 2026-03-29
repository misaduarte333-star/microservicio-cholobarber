import { Request, Response } from 'express';
import { AudioTranscriberService } from '../message-processor/audio-transcriber.service';
import { DebouncerService } from '../message-processor/debouncer.service';
import { BusinessResolverService } from '../businesses/business-resolver.service';
import { logger } from '../../config/logger';

const debouncer = new DebouncerService();

export class WebhookController {

  public static async handle(req: Request, res: Response): Promise<void> {
    // 1. Respond immediately so Evolution API doesn't retry
    res.status(200).send('OK');

    try {
      const payload = req.body;

      if (!payload || !payload.data || !payload.data.key) return;

      // 2. Resolve the tenant from payload.instance (Evolution API v2 field)
      const evolutionInstance: string | undefined = payload.instance;
      if (!evolutionInstance) {
        logger.warn({ payload }, 'Webhook sin campo "instance", ignorando');
        return;
      }

      const businessCtx = await BusinessResolverService.resolveByInstance(evolutionInstance);
      if (!businessCtx) {
        logger.warn({ evolutionInstance }, 'Instancia no reconocida o agente inactivo');
        return;
      }

      // 3. Extract message data
      const remoteJid = payload.data.key.remoteJid;
      if (!remoteJid || remoteJid.includes('@g.us')) return; // ignore groups

      const senderPhone = remoteJid.split('@')[0].split(':')[0];
      const messageType = payload.data.messageType;
      // sessionId is namespaced: {sucursalId}:{phone} — ensures isolation across tenants
      const sessionId = `${businessCtx.sucursalId}:${senderPhone}`;
      const pushName = payload.data.pushName || 'Cliente';
      const timestamp = payload.data.messageTimestamp;

      let finalMessageText = '';

      if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
        finalMessageText = payload.data.message?.conversation || payload.data.message?.extendedTextMessage?.text;
      } else if (messageType === 'audioMessage') {
        const base64Audio = payload.data.message?.base64;
        if (base64Audio) {
          logger.info({ phone: senderPhone, instance: evolutionInstance }, 'Audio recibido, enviando a Whisper');
          finalMessageText = await AudioTranscriberService.transcribe(base64Audio);
        }
      }

      if (!finalMessageText || finalMessageText.trim().length === 0) return;

      const sanitizedText = finalMessageText.trim().substring(0, 1500);

      // 4. Push to debouncer with full business context
      debouncer.pushMessage({
        sessionId,
        senderPhone,
        pushName,
        text: sanitizedText,
        timestamp: new Date(timestamp * 1000).toISOString(),
        businessCtx,
      });

    } catch (error) {
      logger.error({ err: error }, 'Error in webhook controller');
    }
  }
}
