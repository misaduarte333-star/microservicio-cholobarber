import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { supabase } from '../../database/supabase.service';

/**
 * Convierte un timestamp a UTC ISO string.
 * Si el timestamp no tiene timezone, asume America/Hermosillo (UTC-7).
 */
function toUtcIso(ts: string): string {
  // Ya tiene indicador de zona (Z o +/-HH:mm)
  if (/Z$|[+-]\d{2}:\d{2}$/.test(ts)) {
    return DateTime.fromISO(ts).toUTC().toISO()!;
  }
  // Sin timezone → asumir Hermosillo
  return DateTime.fromISO(ts, { zone: 'America/Hermosillo' }).toUTC().toISO()!;
}

export const misCitasTool = tool(
  async ({ cliente_telefono }) => {
    const { data, error } = await supabase
      .from('citas')
      .select('*')
      .eq('cliente_telefono', cliente_telefono)
      .eq('estado', 'confirmada');
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

export const agendarCitaTool = tool(
  async ({ sucursal_id, barbero_id, servicio_id, cliente_nombre, cliente_telefono, timestamp_inicio, timestamp_fin }) => {
    const { data, error } = await supabase.from('citas').insert([
      {
        sucursal_id,
        barbero_id,
        servicio_id,
        cliente_nombre,
        cliente_telefono,
        timestamp_inicio: toUtcIso(timestamp_inicio),
        timestamp_fin: toUtcIso(timestamp_fin),
        estado: 'confirmada',
        origen: 'whatsapp'
      }
    ]).select();

    if (error) {
      if (error.message.includes('unique_cita_activa') || error.code === '23505') {
        return `SLOT_OCUPADO: El barbero solicitado (barbero_id: ${barbero_id}) ya fue reservado por otro cliente en ${timestamp_inicio} (alguien se adelantó). Este cliente NO tiene ninguna cita duplicada. DEBES hacer lo siguiente en orden y presentar TODO en un solo mensaje: 1) Avisar al cliente que alguien tomó ese lugar en el último momento. 2) Llamar DISPONIBILIDAD_HOY con slot_inicio=${timestamp_inicio} para ver si hay OTRO barbero libre a la misma hora — si lo hay, ofrécelo. 3) Llamar DISPONIBILIDAD_OTRO_DIA o DISPONIBILIDAD_HOY avanzando de bloque en bloque (cada 30 min) hasta encontrar el PRIMER slot donde el barbero original (barbero_id: ${barbero_id}) esté disponible — ofrécelo como alternativa. Presenta ambas opciones juntas en un solo mensaje claro.`;
      }
      return `Error agendando cita: ${error.message}`;
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

export const cancelarCitaTool = tool(
  async ({ cliente_telefono, cita_id }) => {
    const { error } = await supabase
      .from('citas')
      .delete()
      .eq('cliente_telefono', cliente_telefono)
      .eq('id', cita_id);
    
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

export const moverCitaTool = tool(
  async ({ cliente_telefono, cita_id, timestamp_inicio, timestamp_fin }) => {
    const { data, error } = await supabase
      .from('citas')
      .update({ timestamp_inicio: toUtcIso(timestamp_inicio), timestamp_fin: toUtcIso(timestamp_fin) })
      .eq('cliente_telefono', cliente_telefono)
      .eq('id', cita_id)
      .select();

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
