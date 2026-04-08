'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

interface ClearHistoryButtonProps {
    sucursalId: string
    phone: string
}

export default function ClearHistoryButton({ sucursalId, phone }: ClearHistoryButtonProps) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleClear = async () => {
        if (!confirm('¿Estás seguro de que deseas borrar TODO el historial de chat para este número? Esta acción no se puede deshacer.')) {
            return
        }

        setLoading(true)
        try {
            const res = await fetch('/api/dev/chat/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sucursalId, phone })
            })

            const data = await res.json()

            if (data.success) {
                alert('Historial borrado correctamente.')
                router.refresh() // Actualiza los datos del Server Component (MonitorPage)
            } else {
                throw new Error(data.error || 'Error desconocido')
            }
        } catch (error: any) {
            console.error('Error al borrar:', error)
            alert(`Error: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleClear}
            disabled={loading}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg
                ${loading 
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                    : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white hover:border-red-500 active:scale-95'
                }`}
        >
            {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
                <Trash2 className="w-3.5 h-3.5" />
            )}
            {loading ? 'Borrando...' : 'Borrar Historial'}
        </button>
    )
}
