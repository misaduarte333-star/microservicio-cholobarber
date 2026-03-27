import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { supabase } from '../../database/supabase.service';
import { EvolutionService } from '../../messaging/evolution.service';

export const consultarServiciosTool = tool(
  async () => {
    const { data, error } = await supabase.from('servicios').select('*').eq('activo', true);
    if (error) return `Error consultando servicios: ${error.message}`;
    return JSON.stringify(data);
  },
  {
    name: 'Consultar_Servicios',
    description: 'Trae los servicios de la barberia para conocer la duracion_minutos su nombre y el UUID.',
    schema: z.object({}),
  }
);

export const consultarBarberosTool = tool(
  async () => {
    const { data, error } = await supabase.from('barberos').select('*').eq('activo', true);
    if (error) return `Error consultando barberos: ${error.message}`;
    return JSON.stringify(data);
  },
  {
    name: 'Consultar_Barberos',
    description: 'Busca los barberos disponibles.',
    schema: z.object({}),
  }
);

export const consultarSucursalTool = tool(
  async () => {
    const { data, error } = await supabase.from('sucursales').select('*');
    if (error) return `Error consultando sucursal: ${error.message}`;
    return JSON.stringify(data);
  },
  {
    name: 'Consultar_Sucursal',
    description: 'Obtiene los datos de la sucursal, incluyendo el JSON de horarios de apertura y cierre por día.',
    schema: z.object({}),
  }
);

export const consultarBloqueosTool = tool(
  async () => {
    const { data, error } = await supabase.from('bloqueos').select('*');
    if (error) return `Error consultando bloqueos: ${error.message}`;
    return JSON.stringify(data);
  },
  {
    name: 'Consultar_Bloqueos',
    description: 'Obtiene los bloqueos o ausencias programadas de los barberos.',
    schema: z.object({}),
  }
);

export const consultarTendenciasTool = tool(
  async () => {
    const { data, error } = await supabase.from('vista_tendencias_servicios').select('*');
    if (error) return `Error consultando tendencias: ${error.message}`;
    return JSON.stringify(data);
  },
  {
    name: 'Consultar_Tendencias',
    description: 'Obtiene las tendencias o cortes populares actuales.',
    schema: z.object({}),
  }
);

export const enviarFotosCortesTool = tool(
  async ({ cliente_telefono, barbero_nombre, servicio_nombre }) => {
    let barbero_id: string | undefined;
    let servicio_id: string | undefined;

    if (barbero_nombre) {
      const { data } = await supabase
        .from('barberos')
        .select('id')
        .ilike('nombre', `%${barbero_nombre}%`)
        .limit(1)
        .single();
      barbero_id = data?.id;
    }

    if (servicio_nombre) {
      const { data } = await supabase
        .from('servicios')
        .select('id')
        .ilike('nombre', `%${servicio_nombre}%`)
        .limit(1)
        .single();
      servicio_id = data?.id;
    }

    let query = supabase
      .from('fotos_cortes')
      .select('url, barberos(nombre), servicios(nombre)')
      .order('created_at', { ascending: false })
      .limit(3);

    if (barbero_id) query = query.eq('barbero_id', barbero_id);
    if (servicio_id) query = query.eq('servicio_id', servicio_id);

    const { data, error } = await query;
    if (error) return `Error consultando fotos: ${error.message}`;
    if (!data || data.length === 0) return 'No hay fotos disponibles con ese filtro.';

    for (const foto of data) {
      const barbero = (foto.barberos as any)?.nombre ?? 'Barbero';
      const servicio = (foto.servicios as any)?.nombre ?? 'Corte';
      await EvolutionService.sendMedia(cliente_telefono, foto.url, `${servicio} por ${barbero} ✂️`);
    }

    return `Enviadas ${data.length} foto(s) al cliente.`;
  },
  {
    name: 'Enviar_Fotos_Cortes',
    description: 'Envía fotos de cortes por WhatsApp al cliente. Úsala cuando el cliente pida ver estilos, cortes disponibles o tendencias. Si el cliente menciona un barbero o servicio por nombre, pásalo como texto — la tool resuelve el UUID internamente.',
    schema: z.object({
      cliente_telefono: z.string().describe('Teléfono del cliente (sender_phone del contexto). Nunca inventes este valor.'),
      barbero_nombre: z.string().optional().describe('Nombre del barbero tal como lo mencionó el cliente. Ejemplo: "Misap", "Angel". No uses UUIDs aquí.'),
      servicio_nombre: z.string().optional().describe('Nombre del servicio. Ejemplo: "Corte", "Barba". No uses UUIDs aquí.'),
    }),
  }
);
