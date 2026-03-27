import { envConfig } from '../../config/env.config';
import { logger } from '../../config/logger';
import { toFile } from 'openai';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: envConfig.OPENAI_API_KEY });

export class AudioTranscriberService {
  /**
   * Transcribe base64-encoded audio (OGG/OPUS from WhatsApp) using OpenAI Whisper.
   * Uses the OpenAI SDK directly to avoid FormData/Blob compatibility issues in Node.js.
   */
  public static async transcribe(base64Audio: string): Promise<string> {
    const buffer = Buffer.from(base64Audio, 'base64');
    const file = await toFile(buffer, 'audio.ogg', { type: 'audio/ogg' });

    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'es',
    });

    logger.info({ text: response.text }, 'Transcripcion Whisper');
    return response.text;
  }
}
