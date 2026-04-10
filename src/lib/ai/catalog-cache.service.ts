import { redis } from './debouncer.service'
import { getAISupabaseClient } from './tools/business.tools'

export class CatalogCacheService {
    private static readonly CACHE_KEY_PREFIX = 'catalog:'

    /**
     * Obtiene el catálogo del negocio (Servicios y Prestadores formateados) de Redis.
     * Si no existe, lo construye desde Supabase y lo cachea.
     * 
     * @param sucursalId  - UUID de la sucursal
     * @param prestadorLabel - Cómo llamar al prestador: 'Barbero', 'Estilista', 'Pedicurista', etc.
     */
    public static async getCatalogContext(sucursalId: string, prestadorLabel: string = 'Barbero'): Promise<string> {
        // La clave de caché es única por sucursal (el label se reconstruye al invalidar)
        const cacheKey = `${this.CACHE_KEY_PREFIX}${sucursalId}`

        // 1. Intentar leer desde Memoria Redis (Super rápido)
        if (redis.status === 'ready') {
            try {
                const cached = await redis.get(cacheKey)
                if (cached) {
                    // El label puede haber cambiado, pero el catálogo cacheado ya lo incluye
                    return cached
                }
            } catch (err) {
                console.warn('[CatalogCacheService] Advertencia: No se pudo leer de Redis, cayendo a Postgres.', err)
            }
        }

        // 2. Fallback: Consultar base de datos
        console.info(`[CatalogCacheService] Caché falló o está vacío para ${sucursalId}. Reconstruyendo catálogo desde Postgres...`)
        const supabase = getAISupabaseClient()

        const [serviciosRes, barberosRes] = await Promise.all([
            supabase.from('servicios').select('id, nombre, duracion_minutos, precio').eq('sucursal_id', sucursalId).eq('activo', true),
            supabase.from('barberos').select('id, nombre, activo').eq('sucursal_id', sucursalId).eq('activo', true)
        ])

        if (serviciosRes.error) console.error('[CatalogCacheService] Error cargando servicios:', serviciosRes.error)
        if (barberosRes.error) console.error('[CatalogCacheService] Error cargando barberos:', barberosRes.error)

        const servicios = serviciosRes.data || []
        const barberos = barberosRes.data || []

        // Pluralizar el label del prestador
        const prestadorPlural = CatalogCacheService.pluralize(prestadorLabel)

        // 3. Formatear con el vocabulario correcto del negocio
        let catalogMarkdown = `===========================================
CATÁLOGO DEL NEGOCIO (PRE-CARGADO)
===========================================
`
        
        catalogMarkdown += `[SERVICIOS DISPONIBLES]\n`
        if (servicios.length > 0) {
            servicios.forEach(s => {
                const precio = s.precio ? `$${s.precio}` : 'Precio variable'
                catalogMarkdown += `- ${s.nombre} | Duración: ${s.duracion_minutos} min | Precio: ${precio} | (Servicio_ID: ${s.id})\n`
            })
        } else {
            catalogMarkdown += `- No hay servicios registrados actualmente.\n`
        }

        // El header de esta sección usa el label del tipo de prestador
        catalogMarkdown += `\n[${prestadorPlural.toUpperCase()} DISPONIBLES]\n`
        if (barberos.length > 0) {
            barberos.forEach(b => {
                catalogMarkdown += `- ${b.nombre} | (${prestadorLabel}_ID: ${b.id})\n`
            })
        } else {
            catalogMarkdown += `- No hay ${prestadorPlural.toLowerCase()} registrados actualmente.\n`
        }

        catalogMarkdown += `\nNOTA: NO inventes ni asumas UUIDs. Usa EXCLUSIVAMENTE los IDs de la lista de arriba u obtenidos de tus Herramientas de disponibilidad al usar AGENDAR_CITA.\n`

        // 4. Guardar en Redis sin expiración ("Inmortal" hasta invalidación explícita)
        if (redis.status === 'ready') {
            try {
                await redis.set(cacheKey, catalogMarkdown, 'EX', 60 * 60 * 24 * 30) // 30 días de seguridad
                console.info(`[CatalogCacheService] Catálogo cacheado en Redis exitosamente para ${sucursalId}.`)
            } catch (err) {
                console.error('[CatalogCacheService] Error seteando el caché en Redis:', err)
            }
        }

        return catalogMarkdown
    }

    /**
     * Pluraliza de forma simple los labels de prestadores más comunes.
     * Para labels custom, agrega 's' al final como fallback.
     */
    private static pluralize(label: string): string {
        const map: Record<string, string> = {
            'Barbero': 'Barberos',
            'Estilista': 'Estilistas',
            'Pedicurista': 'Pedicuristas',
            'Terapeuta': 'Terapeutas',
            'Entrenador': 'Entrenadores',
            'Entrenadora': 'Entrenadoras',
            'Médico': 'Médicos',
            'Manicurista': 'Manicuristas',
            'Cosmetólogo': 'Cosmetólogos',
            'Cosmetóloga': 'Cosmetólogas',
        }
        return map[label] ?? `${label}s`
    }
}
