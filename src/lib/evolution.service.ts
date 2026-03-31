import { createClient } from './supabase'

export class EvolutionService {
    /**
     * Sincroniza el webhook de Evolution con la URL actual del microservicio.
     * @param appUrl URL base del microservicio (ej. https://mi-app.com)
     */
    public static async syncWebhook(appUrl: string): Promise<{ success: boolean; message: string }> {
        try {
            const supabase = createClient()

            // 1. Obtener configuración global
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

            // Priorizar variable de entorno para la URL base (Webhook)
            // Si no está definida, extraemos el origin de la petición dinámica
            const publicUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
            const baseUrl = publicUrl ? new URL(publicUrl).origin : new URL(appUrl).origin
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
                    console.warn('[EvolutionSync] No se pudieron leer webhooks existentes.')
                }
            }

            if (!needsUpdate) {
                return { success: true, message: 'Webhook ya está correctamente configurado.' }
            }

            // 3. Establecer/Actualizar Webhook
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

            return { success: true, message: 'Webhook sincronizado exitosamente.' }

        } catch (error: any) {
            console.error('[EvolutionSync] Error:', error.message)
            return { success: false, message: error.message }
        }
    }
}
