import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { supabase } from '../../database/supabase.service';
import { TimeValidator } from '../tools/time-validator.tool';

export const disponibilidadHoyTool = tool(
  async ({ slot_inicio }) => {
    // Normalizar el slot_inicio: queremos la parte local (ej: 2024-03-23T17:30:00)
    // sin el offset ±HH:MM para comparar con la tabla (timestamp without time zone)
    const localSlot = slot_inicio.replace(/([+-]\d{2}:\d{2}|Z)$/, '');

    // Guard interno: validar que la hora del slot no sea pasada ni menor a 15 min.
    // Esto protege aunque el LLM se salte la tool VALIDAR_HORA.
    const horaParte = localSlot.split('T')[1]?.substring(0, 5); // "HH:mm"
    if (horaParte) {
      const hora_actual = DateTime.now().setZone('America/Hermosillo').toFormat('HH:mm');
      const validacion = TimeValidator.validate({ hora_actual, hora_solicitada: horaParte });
      if (validacion.status === 'RECHAZADA') {
        return JSON.stringify({
          error: 'hora_rechazada',
          motivo: validacion.motivo,
          hora_solicitada_24h: validacion.hora_solicitada_24h,
          siguiente_bloque: validacion.siguiente_bloque,
          siguiente_bloque_12h: validacion.siguiente_bloque_12h,
          mensaje: validacion.motivo === 'pasada'
            ? `La hora ${validacion.hora_solicitada_24h} ya pasó. Llama DISPONIBILIDAD_HOY con siguiente_bloque: ${validacion.siguiente_bloque}`
            : `La hora ${validacion.hora_solicitada_24h} necesita al menos 15 min de anticipación. Llama DISPONIBILIDAD_HOY con siguiente_bloque: ${validacion.siguiente_bloque}`,
        });
      }
    }

    const { data, error } = await supabase
      .from('vista_disponibilidad_hoy')
      .select('*')
      .eq('slot_inicio', localSlot);
    if (error) return `Error consultando disponibilidad hoy: ${error.message}`;
    return JSON.stringify(data);
  },
  {
    name: 'DISPONIBILIDAD_HOY',
    description: 'Usa esta herramienta SOLO cuando la fecha solicitada es hoy. Devuelve los barberos disponibles para una hora específica usando slots.',
    schema: z.object({
      slot_inicio: z.string().describe('Corresponde a la fecha y hora de inicio de la cita. Formato ISO.'),
    }),
  }
);

export const disponibilidadOtroDiaTool = tool(
  async ({ slot_inicio }) => {
    // Normalizar a local time (sin offset ±HH:MM)
    const localSlot = slot_inicio.replace(/([+-]\d{2}:\d{2}|Z)$/, '');
    
    const { data, error } = await supabase
      .from('slots_barberos')
      .select('*')
      .eq('slot_inicio', localSlot);
    if (error) return `Error consultando disponibilidad otro dia: ${error.message}`;
    return JSON.stringify(data);
  },
  {
    name: 'DISPONIBILIDAD_OTRO_DIA',
    description: 'Usa esta herramienta cuando la fecha NO es hoy. Consulta disponibilidad futura en slots.',
    schema: z.object({
      slot_inicio: z.string().describe('Corresponde a la fecha y hora de la cita. Formato ISO.'),
    }),
  }
);
