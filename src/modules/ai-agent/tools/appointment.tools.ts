import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { supabase } from '../../database/supabase.service';

/**
 * Converts a timestamp to UTC ISO string.
 * If the timestamp has no timezone, assumes America/Hermosillo (UTC-7).
 */
function toUtcIso(ts: string): string {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(ts)) {
    return DateTime.fromISO(ts).toUTC().toISO()!;
  }
  return DateTime.fromISO(ts, { zone: 'America/Hermosillo' }).toUTC().toISO()!;
}

export function makeMisCitasTool(sucursalId: string) {
  return tool(
    async ({ cliente_telefono }) => {
      const query = supabase
        .from('citas')
        .select('*')
        .eq('cliente_telefono', cliente_telefono)
        .eq('estado', 'confirmada');

      if (sucursalId) query.eq('sucursal_id', sucursalId);

      const { data, error } = await query;
      if (error) return `Error al consultar mis citas: ${error.message}`;
      return JSON.stringify(data);
    },
    {
      name: 'MIS_CITAS',
      description: 'Extrae las citas confirmadas del cliente. Usa siempre el teléfono del sender (viene del contexto como sender_phone).',
      schema: z.object({
        cliente_telefono: z.string().describe('Teléfono del cliente (sender_phone del contexto del sistema)'),
      }),
    }
  );
}

export function makeAgendarCitaTool(sucursalId: string) {
  return tool(
    async ({ sucursal_id, barbero_id, servicio_id, cliente_nombre, cliente_telefono, timestamp_inicio, timestamp_fin }) => {
      // Enforce the tenant's sucursal_id even if the LLM passes a different one
      const effectiveSucursalId = sucursalId || sucursal_id;

      const { data, error } = await supabase.from('citas').insert([
        {
          sucursal_id: effectiveSucursalId,
          barbero_id,
          servicio_id,
          cliente_nombre,
          cliente_telefono,
          timestamp_inicio: toUtcIso(timestamp_inicio),
          timestamp_fin: toUtcIso(timestamp_fin),
          estado: 'confirmada',
          origen: 'whatsapp',
        },
      ]).select();

      if (error) {
        if (error.message.includes('unique_cita_activa') || error.code === '23505') {
          return JSON.stringify({
            status: 'error',
            error_code: 'SLOT_OCUPADO',
            instruccion_para_agente: 'El horario acaba de ser ocupado por otra persona (Race Condition). Disculpate amablemente con el cliente explicando que alguien más acaba de tomar ese lugar hace un instante, y pregúntale si prefiere otro horario u otro barbero para buscarle disponibilidad.'
          });
        }
        return JSON.stringify({ status: 'error', message: error.message });
      }
      return JSON.stringify(data);
    },
    {
      name: 'AGENDAR_CITA',
      description: 'Agendar cita en crudo. El origen siempre es "whatsapp". El estado siempre "confirmada".',
      schema: z.object({
        sucursal_id: z.string().describe('UUID de la sucursal (obtenido de Consultar_Sucursal)'),
        barbero_id: z.string().describe('UUID del barbero (obtenido de Consultar_Barberos)'),
        servicio_id: z.string().describe('UUID del servicio (obtenido de Consultar_Servicios)'),
        cliente_nombre: z.string().describe('Nombre real del cliente. Si no lo conoces, PREGÚNTALO al cliente antes de llamar esta tool.'),
        cliente_telefono: z.string().describe('Teléfono del cliente (sender_phone del contexto del sistema). Nunca inventes ni uses valores por defecto.'),
        timestamp_inicio: z.string().describe('Timestamp ISO UTC'),
        timestamp_fin: z.string().describe('Timestamp ISO UTC (inicio + duracion)'),
      }),
    }
  );
}

export function makeCancelarCitaTool(sucursalId: string) {
  return tool(
    async ({ cliente_telefono, cita_id }) => {
      const query = supabase
        .from('citas')
        .delete()
        .eq('cliente_telefono', cliente_telefono)
        .eq('id', cita_id);

      if (sucursalId) query.eq('sucursal_id', sucursalId);

      const { error } = await query;
      if (error) return `Error cancelando cita: ${error.message}`;
      return 'Cita cancelada exitosamente';
    },
    {
      name: 'CANCELAR_CITA',
      description: 'Cancela una cita utilizando el UUID de la misma (obtenido en MIS_CITAS).',
      schema: z.object({
        cliente_telefono: z.string(),
        cita_id: z.string(),
      }),
    }
  );
}

export function makeMoverCitaTool(sucursalId: string) {
  return tool(
    async ({ cliente_telefono, cita_id, timestamp_inicio, timestamp_fin }) => {
      const query = supabase
        .from('citas')
        .update({ timestamp_inicio: toUtcIso(timestamp_inicio), timestamp_fin: toUtcIso(timestamp_fin) })
        .eq('cliente_telefono', cliente_telefono)
        .eq('id', cita_id);

      if (sucursalId) query.eq('sucursal_id', sucursalId);

      const { data, error } = await query.select();
      if (error) return `Error moviendo cita: ${error.message}`;
      return JSON.stringify(data);
    },
    {
      name: 'MOVER_CITA',
      description: 'Reagenda, mueve o cambia hora de la cita. El nuevo inicio/fin de la cita deben usarse aquí.',
      schema: z.object({
        cliente_telefono: z.string(),
        cita_id: z.string(),
        timestamp_inicio: z.string().describe('Nuevo Timestamp ISO UTC'),
        timestamp_fin: z.string().describe('Nuevo Timestamp ISO UTC'),
      }),
    }
  );
}

// ── Legacy named exports (backward compat) ────────────────────────────────────
export const misCitasTool    = makeMisCitasTool('');
export const agendarCitaTool = makeAgendarCitaTool('');
export const cancelarCitaTool = makeCancelarCitaTool('');
export const moverCitaTool   = makeMoverCitaTool('');
