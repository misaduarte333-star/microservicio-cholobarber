import { PostgresChatMessageHistory } from '@langchain/community/stores/message/postgres';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Pool } from 'pg';
import { DateTime } from 'luxon';
import { envConfig } from '../../config/env.config';

// Singleton pool para evitar multiples conexiones
const pool = envConfig.MOCK_MODE ? null as any : new Pool({
  connectionString: envConfig.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
});

const mockMemories: Record<string, InMemoryChatMessageHistory> = {};

/**
 * Wrapper sobre el historial real que:
 * 1. Limita a los últimos MAX_MESSAGES mensajes para evitar contexto muy antiguo
 * 2. Inyecta un aviso al inicio de cada turno indicando que los datos de
 *    disponibilidad y horarios son stale — el agente DEBE re-consultar tools
 *
 * El contexto conversacional relevante (nombre, preferencias) se conserva,
 * pero el agente no puede confiar en disponibilidad ni validaciones de hora previas.
 */
class FreshContextHistory extends BaseChatMessageHistory {
  lc_namespace = ['cholobot', 'memory'];

  private static readonly MAX_MESSAGES = 50; // 25 turnos de conversación

  constructor(private inner: PostgresChatMessageHistory | InMemoryChatMessageHistory) {
    super();
  }

  async getMessages(): Promise<BaseMessage[]> {
    const all = await this.inner.getMessages();
    const limited = all.slice(-FreshContextHistory.MAX_MESSAGES);

    if (limited.length === 0) return [];

    const now = DateTime.now().setZone('America/Hermosillo').toFormat('HH:mm');

    // Este aviso aparece al inicio del historial en cada turno nuevo.
    // Le indica al agente que los datos temporales del historial no son confiables.
    const staleWarning = new HumanMessage(
      `[SISTEMA ${now}] Nuevo turno iniciado. ` +
      `IMPORTANTE: cualquier dato de disponibilidad, validación de hora o slots ` +
      `que aparezca en el historial está DESACTUALIZADO — el tiempo ha pasado. ` +
      `Si el cliente propone o cambia una hora, DEBES llamar VALIDAR_HORA y DISPONIBILIDAD_HOY/OTRO_DIA antes de responder. ` +
      `EXCEPCIÓN CRÍTICA: Si el cliente acaba de confirmar una propuesta que tú le hiciste (dice "sí", "si", "dale", "ok", "sí porfa", etc. sin proponer una hora nueva), ` +
      `llama VALIDAR_HORA y DISPONIBILIDAD_HOY para verificar disponibilidad, ` +
      `y si el barbero sigue disponible EJECUTA AGENDAR_CITA INMEDIATAMENTE — NO vuelvas a mostrar disponibilidad ni a pedir confirmación. ` +
      `El nombre del cliente y sus preferencias sí son válidos.`,
    );

    return [staleWarning, ...limited];
  }

  async addMessage(message: BaseMessage): Promise<void> {
    return this.inner.addMessage(message);
  }

  async addMessages(messages: BaseMessage[]): Promise<void> {
    return this.inner.addMessages(messages);
  }

  async addUserMessage(message: string): Promise<void> {
    return this.inner.addUserMessage(message);
  }

  async addAIMessage(message: string): Promise<void> {
    return this.inner.addAIMessage(message);
  }

  async clear(): Promise<void> {
    return this.inner.clear();
  }
}

export class MemoryService {
  /**
   * Retorna el historial de chat para un sessionId dado, envuelto en
   * FreshContextHistory para forzar re-consulta de tools en cada turno.
   */
  public static async getChatHistory(sessionId: string): Promise<BaseChatMessageHistory> {
    if (envConfig.MOCK_MODE) {
      if (!mockMemories[sessionId]) {
        mockMemories[sessionId] = new InMemoryChatMessageHistory();
      }
      return new FreshContextHistory(mockMemories[sessionId]);
    }

    const inner = new PostgresChatMessageHistory({
      sessionId,
      pool,
      tableName: 'n8n_chat_histories',
    });

    return new FreshContextHistory(inner);
  }
}
