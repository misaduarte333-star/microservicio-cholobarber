import { redis } from './debouncer.service'
import { getAISupabaseClient } from './tools/business.tools'

export class CatalogCacheService {
    private static readonly CACHE_KEY_PREFIX = 'catalog:'

    /**
     * Obtiene el catálogo del negocio (Servicios y Barberos formateados) de Redis.
     * Si no existe, lo construye desde Supabase y lo cachea.
     */
    public static async getCatalogContext(sucursalId: string): Promise<string> {
        const cacheKey = `${this.CACHE_KEY_PREFIX}${sucursalId}`

        // 1. Intentar leer desde Memoria Redis (Super rápido)
        if (redis.status === 'ready') {
            try {
                const cached = await redis.get(cacheKey)
                if (cached) {
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
            supabase.from('barberos').select('id, nombre, especialidad').eq('sucursal_id', sucursalId).eq('activo', true)
        ])

        if (serviciosRes.error) console.error('[CatalogCacheService] Error cargando servicios:', serviciosRes.error)
        if (barberosRes.error) console.error('[CatalogCacheService] Error cargando barberos:', barberosRes.error)

        const servicios = serviciosRes.data || []
        const barberos = barberosRes.data || []

        // 3. Formatear
        let catalogMarkdown = `═══════════════════════════════════════════\nCATÁLOGO DEL NEGOCIO (PRE-CARGADO)\n═══════════════════════════════════════════\n`
        
        catalogMarkdown += `[SERVICIOS DISPONIBLES]\n`
        if (servicios.length > 0) {
            servicios.forEach(s => {
                const precio = s.precio ? `$${s.precio}` : 'Precio variable'
                catalogMarkdown += `- ${s.nombre} | Duración: ${s.duracion_minutos} min | Precio: ${precio} | (Servicio_ID: ${s.id})\n`
            })
        } else {
            catalogMarkdown += `- No hay servicios registrados actualmente.\n`
        }

        catalogMarkdown += `\n[BARBEROS DISPONIBLES]\n`
        if (barberos.length > 0) {
            barberos.forEach(b => {
                catalogMarkdown += `- ${b.nombre} ${b.especialidad ? `(${b.especialidad})` : ''} | (Barbero_ID: ${b.id})\n`
            })
        } else {
            catalogMarkdown += `- No hay barberos registrados actualmente.\n`
        }

        catalogMarkdown += `\nNOTA: NO inventes ni asumas UUIDs. Usa EXCLUSIVAMENTE los IDs de la lista de arriba u obtenidos de tus Herramientas de disponibilidad al usar AGENDAR_CITA.\n`

        // 4. Guardar en Redis sin expiración ("Inmortal" hasta invalidación explícita)
        if (redis.status === 'ready') {
            try {
                // Almacenar con un TTL muy largo de seguridad por si a caso (30 días), 
                // aunque la invalidación por webhook lo borrará nativamente.
                await redis.set(cacheKey, catalogMarkdown, 'EX', 60 * 60 * 24 * 30) // 30 días
                console.info(`[CatalogCacheService] Catálogo cachead en Redis exitosamente para ${sucursalId}.`)
            } catch (err) {
                console.error('[CatalogCacheService] Error seteando el caché en Redis:', err)
            }
        }

        return catalogMarkdown
    }
}
