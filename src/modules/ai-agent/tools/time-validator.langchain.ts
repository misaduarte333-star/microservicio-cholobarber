import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { TimeValidator } from './time-validator.tool';

export const validarHoraTool = tool(
  async ({ hora_solicitada }) => {
    try {
      const hora_actual = DateTime.now().setZone('America/Hermosillo').toFormat('HH:mm');
      const result = TimeValidator.validate({ hora_actual, hora_solicitada });
      return JSON.stringify(result);
    } catch (error: any) {
      return `Error validando hora: ${error.message}`;
    }
  },
  {
    name: 'VALIDAR_HORA',
    description: 'Valida si una hora solicitada por el cliente es válida con al menos 15 minutos de anticipación. SIEMPRE llamar esta tool antes de consultar disponibilidad. La hora actual se obtiene automáticamente del servidor.',
    schema: z.object({
      hora_solicitada: z.string().describe('Hora EXACTA que dijo el cliente, sin modificar ni redondear. Ejemplos: "2", "2pm", "2:00 pm", "14:00". NUNCA conviertas ni ajustes la hora antes de pasarla.'),
    }),
  }
);
