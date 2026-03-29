'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Layout del panel de desarrollador.
 * Verifica que el usuario tenga sesión activa con rol 'dev'.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [authorized, setAuthorized] = useState(false)

    useEffect(() => {
        const raw = sessionStorage.getItem('barbercloud_session')
        if (!raw) {
            router.replace('/')
            return
        }
        try {
            const session = JSON.parse(raw)
            if (session.role !== 'dev') {
                router.replace('/')
                return
            }
            setAuthorized(true)
        } catch {
            router.replace('/')
        }
    }, [router])

    if (!authorized) {
        return <div className="min-h-screen bg-background flex items-center justify-center"><div className="spinner" /></div>
    }

    return <>{children}</>
}
