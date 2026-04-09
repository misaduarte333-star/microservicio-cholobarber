import { createClient } from './supabase'

export class EvolutionService {
    /**
     * Sincroniza el webhook de Evolution con la URL actual del microservicio.
     * @param appUrl URL base del microservicio (ej. https://mi-app.com)
     */
    public static async syncWebhook(appUrl: string): Promise<{ success: boolean; message: string }> {
        try {
            if (process.env.NODE_ENV === 'development') {
                console.log('[EvolutionSync] Saltando sincronización de webhook en entorno de desarrollo local para proteger instancia en AWS...')
                return { success: true, message: 'Omitido en entorno local.' }
            }

            const supabase = createClient()
            // 1. Obtener configuración global de la tabla que creamos
            const { data, error } = await supabase
                .from('configuracion_ia_global')
                .select('*')
                .eq('id', 1)
                .single()
            const config = data as any

            if (error || !config || !config.evolution_api_url) {
                return { success: false, message: 'Falta configuración global de Evolution en Supabase.' }
            }

            const evoBaseUrl = config.evolution_api_url.endsWith('/') ? config.evolution_api_url : `${config.evolution_api_url}/`
            const apikey = config.evolution_api_key
            const instance = process.env.EVOLUTION_INSTANCE || 'barberia'
            // Priorizar variable de entorno pública en lugar de la URL interna del contenedor
            // (dentro de Docker/EasyPanel, req.url puede resolver a 0.0.0.0 o a localhost)
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL
                || process.env.APP_URL
                || (() => { try { return new URL(appUrl).origin } catch { return appUrl } })()
            const webhookUrl = `${baseUrl}/api/webhook/evolution`

            console.log(`[EvolutionSync] Verificando webhook para instancia ${instance} -> ${webhookUrl}`)

            // 2. Consultar webhook actual en Evolution
            const findRes = await fetch(`${evoBaseUrl}webhook/find/${instance}`, {
                headers: { apikey },
                signal: AbortSignal.timeout(5000)
            })

            let needsUpdate = true
            if (findRes.ok) {
                try {
                    const webhooks = await findRes.json()
                    // Verificamos si ya existe uno con nuestra URL y que esté habilitado
                    const current = Array.isArray(webhooks) ? webhooks.find((w: any) => w.url === webhookUrl) : null
                    if (current && current.enabled) {
                        needsUpdate = false
                    }
                } catch (e) {
                    console.warn('[EvolutionSync] No se pudieron leer webhooks existentes, se procederá a actualizar.')
                }
            }

            if (!needsUpdate) {
                return { success: true, message: 'Webhook ya está correctamente configurado.' }
            }

            // 3. Establecer/Actualizar Webhook (Usando el formato de objeto anidado que funciona)
            const setRes = await fetch(`${evoBaseUrl}webhook/set/${instance}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    apikey 
                },
                body: JSON.stringify({
                    webhook: {
                        url: webhookUrl,
                        enabled: true,
                        events: ['MESSAGES_UPSERT']
                    }
                }),
                signal: AbortSignal.timeout(10000)
            })

            if (!setRes.ok) {
                const errData = await setRes.text()
                throw new Error(`Error Evolution API: ${setRes.status} - ${errData}`)
            }

            console.log(`[EvolutionSync] Webhook sincronizado exitosamente en ${instance}`)
            return { success: true, message: 'Webhook sincronizado exitosamente.' }

        } catch (error: any) {
            console.error('[EvolutionSync] Error catastrófico:', error.message)
            return { success: false, message: error.message }
        }
    }

    /**
     * Envía un mensaje de texto simple a través de Evolution API.
     */
    public static async sendTextMessage(baseUrl: string, apikey: string, instance: string, phone: string, text: string): Promise<boolean> {
        try {
            const evoBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
            const res = await fetch(`${evoBaseUrl}message/sendText/${instance}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey
                },
                body: JSON.stringify({
                    number: phone,
                    text: text,
                    delay: 1200,
                    linkPreview: false
                })
            })

            if (!res.ok) {
                const err = await res.text()
                console.error(`[EvolutionService] Error enviando mensaje a ${phone}:`, err)
                return false
            }

            return true
        } catch (error: any) {
            console.error(`[EvolutionService] Error catastrófico enviando mensaje a ${phone}:`, error.message)
            return false
        }
    }
}
