import { Request, Response } from 'express';
import { AudioTranscriberService } from '../message-processor/audio-transcriber.service';
import { DebouncerService } from '../message-processor/debouncer.service';
import { logger } from '../../config/logger';

const debouncer = new DebouncerService();

export class WebhookController {
  
  public static async handle(req: Request, res: Response): Promise<void> {
    // 1. Respondemos inmediatamente 200 OK para que Evolution API no corte la conexión ni reintente
    res.status(200).send('OK');

    try {
      const payload = req.body;

      // 2. Extracción de variables igual que el nodo n8n (messages extraction1)
      if (!payload || !payload.data || !payload.data.key) return;

      const remoteJid = payload.data.key.remoteJid;
      if (!remoteJid || remoteJid.includes('@g.us')) return; // Ignoramos grupos

      const senderPhone = remoteJid.split('@')[0].split(':')[0];
      const messageType = payload.data.messageType;
      const sessionId = senderPhone; // Sesión por número — preserva historial de la conversación
      const pushName = payload.data.pushName || 'Cliente';
      const timestamp = payload.data.messageTimestamp;

      let finalMessageText = '';

      if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
        finalMessageText = payload.data.message?.conversation || payload.data.message?.extendedTextMessage?.text;
      } else if (messageType === 'audioMessage') {
        const base64Audio = payload.data.message?.base64;
        if (base64Audio) {
          logger.info({ phone: senderPhone }, 'Audio recibido, enviando a Whisper');
          finalMessageText = await AudioTranscriberService.transcribe(base64Audio);
        }
      }

      if (!finalMessageText) return; // Si no es texto o audio, lo ignoramos

      // 3. Enviamos al Buffer de Redis (Switch, Wait, etc)
      debouncer.pushMessage({
        sessionId,
        senderPhone,
        pushName,
        text: finalMessageText,
        timestamp: new Date(timestamp * 1000).toISOString()
      });

    } catch (error) {
      logger.error({ err: error }, 'Error in webhook controller');
    }
  }
}
