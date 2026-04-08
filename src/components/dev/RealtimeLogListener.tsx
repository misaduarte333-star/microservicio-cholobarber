'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface RealtimeLogListenerProps {
    sucursalId: string
}

export default function RealtimeLogListener({ sucursalId }: RealtimeLogListenerProps) {
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        if (!sucursalId) return

        console.log(`[Realtime] Suscribiéndose a logs para sucursal: ${sucursalId}`)

        const channel = supabase
            .channel(`logs_${sucursalId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'ia_request_logs',
                    filter: `sucursal_id=eq.${sucursalId}`
                },
                (payload) => {
                    console.log('[Realtime] Nuevo log detectado, actualizando...', payload)
                    router.refresh()
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime] Estado suscripción: ${status}`)
            })

        return () => {
            console.log('[Realtime] Limpiando suscripción')
            supabase.removeChannel(channel)
        }
    }, [sucursalId, router, supabase])

    return null // Este componente no renderiza nada visualmente
}
