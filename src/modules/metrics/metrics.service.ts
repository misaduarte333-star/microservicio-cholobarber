import { supabase } from '../database/supabase.service';
import { logger } from '../../config/logger';

export interface ToolStep {
  name: string;
  input: Record<string, any>;
  output: string;
}

export interface RequestLog {
  id: string;
  timestamp: number;
  sessionId: string;
  phone: string;
  inputPreview: string;
  outputPreview: string;
  latencyMs: number;
  toolsUsed: ToolStep[];
  error?: string;
  source: 'webhook' | 'chat';
}

export class MetricsService {
  private static cache: RequestLog[] = [];
  private static readonly CACHE_SIZE = 500;
  private static initialized = false;

  // Carga los últimos logs de DB al arrancar el servicio
  static async init(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('request_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(this.CACHE_SIZE);

      if (error) throw error;

      this.cache = (data || []).map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        sessionId: row.session_id,
        phone: row.phone,
        inputPreview: row.input_preview || '',
        outputPreview: row.output_preview || '',
        latencyMs: row.latency_ms,
        toolsUsed: row.tools_used || [],
        error: row.error || undefined,
        source: row.source,
      }));

      this.initialized = true;
      logger.info({ count: this.cache.length }, 'MetricsService: caché cargada desde DB');
    } catch (e: any) {
      logger.error({ err: e.message }, 'MetricsService: error cargando caché inicial');
    }
  }

  static record(log: RequestLog): void {
    // Actualizar caché en memoria inmediatamente
    this.cache.unshift(log);
    if (this.cache.length > this.CACHE_SIZE) {
      this.cache.length = this.CACHE_SIZE;
    }

    // Persistir en Supabase de forma asíncrona (sin bloquear)
    supabase.from('request_logs').insert([{
      id: log.id,
      timestamp: log.timestamp,
      session_id: log.sessionId,
      phone: log.phone,
      input_preview: log.inputPreview,
      output_preview: log.outputPreview,
      latency_ms: log.latencyMs,
      tools_used: JSON.parse(JSON.stringify(log.toolsUsed)),
      error: log.error || null,
      source: log.source,
    }]).then(({ error }) => {
      if (error) logger.error({ err: error.message }, 'MetricsService: error persistiendo log');
    });
  }

  static getStats() {
    const now = Date.now();
    const last30min = this.cache.filter(l => now - l.timestamp < 30 * 60 * 1000);
    const errors = this.cache.filter(l => !!l.error);

    const avgLatency = this.cache.length > 0
      ? Math.round(this.cache.reduce((s, l) => s + l.latencyMs, 0) / this.cache.length)
      : 0;

    const toolCounts: Record<string, number> = {};
    this.cache.forEach(log => {
      log.toolsUsed.forEach(t => {
        toolCounts[t.name] = (toolCounts[t.name] || 0) + 1;
      });
    });

    const toolCountsSorted = Object.entries(toolCounts)
      .sort(([, a], [, b]) => b - a)
      .reduce<Record<string, number>>((acc, [k, v]) => { acc[k] = v; return acc; }, {});

    const activeSessions = new Set(last30min.map(l => l.sessionId)).size;

    const errorPatterns: Record<string, number> = {};
    errors.forEach(e => {
      const key = (e.error || 'unknown').substring(0, 80);
      errorPatterns[key] = (errorPatterns[key] || 0) + 1;
    });

    return {
      total: this.cache.length,
      errors: errors.length,
      errorRate: this.cache.length > 0 ? ((errors.length / this.cache.length) * 100).toFixed(1) : '0.0',
      avgLatencyMs: avgLatency,
      activeSessions,
      last30min: last30min.length,
      toolCounts: toolCountsSorted,
      errorPatterns,
      recentErrors: errors.slice(0, 15).map(e => ({
        timestamp: e.timestamp,
        sessionId: e.sessionId,
        phone: e.phone,
        error: e.error,
        input: e.inputPreview,
        toolsUsed: e.toolsUsed.map(t => t.name),
      })),
    };
  }

  static getLogs(limit = 50): RequestLog[] {
    return this.cache.slice(0, limit);
  }

  // Agrupa logs por sessionId — cada grupo es una conversación
  static getConversations() {
    const map = new Map<string, RequestLog[]>();

    for (const log of this.cache) {
      const key = log.sessionId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }

    const conversations = Array.from(map.entries()).map(([sessionId, logs]) => {
      const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
      const last = sorted[sorted.length - 1];
      const allTools = sorted.flatMap(l => l.toolsUsed.map(t => t.name));
      const booked = allTools.includes('AGENDAR_CITA');
      const hasError = sorted.some(l => !!l.error);
      const totalLatency = sorted.reduce((s, l) => s + l.latencyMs, 0);

      return {
        sessionId,
        phone: last.phone,
        source: last.source,
        messageCount: sorted.length,
        firstTimestamp: sorted[0].timestamp,
        lastTimestamp: last.timestamp,
        lastInput: last.inputPreview,
        lastOutput: last.outputPreview,
        totalLatencyMs: totalLatency,
        tools: [...new Set(allTools)],
        status: booked ? 'booked' : hasError ? 'error' : 'active',
        logs: sorted,
      };
    });

    // Ordenar por último mensaje más reciente
    return conversations.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }

  static getSessionLogs(sessionId: string): RequestLog[] {
    return this.cache
      .filter(l => l.sessionId === sessionId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}
