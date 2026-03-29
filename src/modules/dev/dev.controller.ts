import { Request, Response } from 'express';
import { supabase } from '../database/supabase.service';

export class DevController {
  static async listNegocios(_req: Request, res: Response): Promise<void> {
    const { data, error } = await supabase
      .from('sucursales')
      .select('id, nombre, evolution_instance, agent_active, agent_name, agent_personality, llm_provider, llm_model, timezone, plan, created_at')
      .order('created_at', { ascending: false });

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data ?? []);
  }

  static async createNegocio(req: Request, res: Response): Promise<void> {
    const {
      nombre, slug, telefono_whatsapp,
      agent_name, agent_personality,
      llm_provider, llm_model, llm_api_key,
      evolution_url, evolution_key,
      plan, timezone,
    } = req.body;

    if (!nombre?.trim()) {
      res.status(400).json({ error: 'El nombre es requerido' });
      return;
    }

    const instance = (slug || nombre).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    const payload: Record<string, any> = {
      nombre: nombre.trim(),
      evolution_instance: instance,
      evolution_url: evolution_url || '',
      evolution_key: evolution_key || '',
      agent_active: true,
      agent_name: agent_name?.trim() || 'Asistente',
      agent_personality: agent_personality || 'friendly',
      llm_provider: llm_provider || 'openai',
      llm_model: llm_model || null,
      llm_api_key: llm_api_key || null,
      timezone: timezone || 'America/Hermosillo',
    };

    // Campos opcionales — se incluyen solo si la columna existe en el esquema
    if (plan) payload.plan = plan;
    if (telefono_whatsapp) payload.telefono_whatsapp = telefono_whatsapp;

    const { data, error } = await supabase
      .from('sucursales')
      .insert([payload])
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(201).json(data);
  }

  static async updateNegocio(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const updates = { ...req.body };
    delete updates.id;
    delete updates.created_at;

    const { data, error } = await supabase
      .from('sucursales')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
  }

  static async toggleNegocio(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    const { data: current, error: fetchErr } = await supabase
      .from('sucursales')
      .select('agent_active')
      .eq('id', id)
      .single();

    if (fetchErr || !current) { res.status(404).json({ error: 'Negocio no encontrado' }); return; }

    const { data, error } = await supabase
      .from('sucursales')
      .update({ agent_active: !current.agent_active })
      .eq('id', id)
      .select()
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json(data);
  }
}
