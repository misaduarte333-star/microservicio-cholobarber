import OpenAI, { toFile } from 'openai'

/**
 * AudioTranscriberService
 * Uses OpenAI Whisper to transcribe base64 audio messages from WhatsApp.
 */
export class AudioTranscriberService {
    private static getClient() {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) throw new Error('Missing OPENAI_API_KEY')
        return new OpenAI({ apiKey })
    }

    /**
     * Transcribes base64-encoded audio (OGG/OPUS from WhatsApp)
     */
    public static async transcribe(base64Audio: string): Promise<string> {
        try {
            const openai = this.getClient()
            const buffer = Buffer.from(base64Audio, 'base64')
            
            // Standard OpenAI format for Node.js buffer to file
            const file = await toFile(buffer, 'audio.ogg', { type: 'audio/ogg' })

            const response = await openai.audio.transcriptions.create({
                file,
                model: 'whisper-1',
                language: 'es',
            })

            console.info('[Whisper] Transcripción exitosa:', response.text)
            return response.text
        } catch (error: any) {
            console.error('[Whisper] Error:', error.message)
            return ''
        }
    }
}
