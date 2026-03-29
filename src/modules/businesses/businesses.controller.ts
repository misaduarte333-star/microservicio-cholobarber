import { Request, Response } from 'express';
import { supabase } from '../database/supabase.service';
import { BusinessResolverService } from './business-resolver.service';
import { envConfig } from '../../config/env.config';
import { logger } from '../../config/logger';

/** Bearer-token auth middleware for the /api/agents/* routes */
export function requireSaasAuth(req: Request, res: Response, next: () => void): void {
  const token = envConfig.ADMIN_TOKEN;
  if (!token) { next(); return; } // no token configured → dev mode, open

  const authHeader = req.headers.authorization;
  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (provided === token) { next(); return; }
  res.status(401).json({ error: 'Unauthorized' });
}

export class BusinessesController {

  /** GET /api/agents — list all sucursales with agent config */
  public static async list(_req: Request, res: Response): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('sucursales')
        .select('id, nombre, slug, plan, telefono_whatsapp, timezone, agent_name, agent_personality, agent_greeting, agent_custom_prompt, evolution_instance, evolution_url, llm_provider, llm_model, agent_active, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ err: error.message }, 'Supabase list sucursales failed');
        res.status(500).json({ error: error.message });
        return;
      }
      res.json({ data });
    } catch (e: any) {
      logger.error({ err: e.message }, 'BusinessesController.list crash');
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  /** PATCH /api/agents/:id — update agent config + invalidate Redis cache */
  public static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const allowed = [
      'agent_name', 'agent_personality', 'agent_greeting', 'agent_custom_prompt',
      'evolution_instance', 'evolution_url', 'evolution_key',
      'llm_provider', 'llm_model', 'llm_api_key',
      'agent_active', 'timezone',
    ];

    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const { data, error } = await supabase
      .from('sucursales')
      .update(updates)
      .eq('id', id)
      .select('evolution_instance')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    // Invalidate cache so the next webhook picks up the new config immediately
    if (data?.evolution_instance) {
      await BusinessResolverService.invalidateCache(data.evolution_instance);
    }
    // Also invalidate by the new instance name if it changed
    if (updates.evolution_instance && updates.evolution_instance !== data?.evolution_instance) {
      await BusinessResolverService.invalidateCache(updates.evolution_instance);
    }

    res.json({ ok: true });
  }

  /** POST /api/agents/:id/toggle — flip agent_active */
  public static async toggle(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const { data: current, error: fetchError } = await supabase
      .from('sucursales')
      .select('agent_active, evolution_instance')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      res.status(404).json({ error: fetchError?.message ?? 'Not found' });
      return;
    }

    const newActive = !current.agent_active;

    const { error } = await supabase
      .from('sucursales')
      .update({ agent_active: newActive })
      .eq('id', id);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (current.evolution_instance) {
      await BusinessResolverService.invalidateCache(current.evolution_instance);
    }

    res.json({ ok: true, agent_active: newActive });
  }

  /** POST /api/agents/:id/test-wa — test Evolution API connectivity */
  public static async testWa(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('sucursales')
      .select('evolution_instance, evolution_url, evolution_key')
      .eq('id', id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: error?.message ?? 'Not found' });
      return;
    }

    const url = data.evolution_url || envConfig.EVOLUTION_API_URL;
    const key = data.evolution_key || envConfig.EVOLUTION_API_KEY;
    const instance = data.evolution_instance;

    if (!url || !key || !instance) {
      res.status(400).json({ error: 'Evolution API not fully configured for this sucursal' });
      return;
    }

    const start = Date.now();
    try {
      const response = await fetch(`${url}/instance/connectionState/${instance}`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(8000),
      });
      const latencyMs = Date.now() - start;
      if (response.ok) {
        const body = await response.json() as any;
        res.json({ ok: true, latencyMs, state: body?.instance?.state ?? body?.state });
      } else {
        const body = await response.text();
        res.json({ ok: false, latencyMs, error: body });
      }
    } catch (err: any) {
      logger.warn({ err, instance }, 'test-wa falló');
      res.json({ ok: false, latencyMs: Date.now() - start, error: err.message });
    }
  }

  /** GET /api/agents/:id/metrics — placeholder, extend with real metrics later */
  public static async metrics(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    // Future: filter MetricsService records by sucursalId prefix in sessionId
    res.json({ sucursalId: id, note: 'Detailed per-tenant metrics coming soon' });
  }
}
