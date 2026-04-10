'use client'

import { useState } from 'react'
import { Zap, Save, Edit3, X } from 'lucide-react'

interface PromptEditorProps {
    sucursalId: string
    initialCustomPrompt: string
}

export default function PromptEditor({ sucursalId, initialCustomPrompt }: PromptEditorProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [prompt, setPrompt] = useState(initialCustomPrompt)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const handleSave = async () => {
        setIsSaving(true)
        setMessage(null)
        try {
            const res = await fetch(`/api/dev/sucursal/${sucursalId}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customPrompt: prompt })
            })
            if (!res.ok) throw new Error('Error al guardar')
            
            setMessage({ type: 'success', text: 'Guardado ✅' })
            setIsEditing(false)
            setTimeout(() => setMessage(null), 3000)
        } catch (error: any) {
            setMessage({ type: 'error', text: 'Error: ' + error.message })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="bg-slate-900/80 rounded-xl p-4 border border-amber-500/30 shadow-lg shadow-amber-500/5 transition-all">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] text-amber-400 uppercase tracking-widest font-bold flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5" /> Instrucciones Personalizadas
                </h3>
                <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                    {isEditing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                </button>
            </div>

            {isEditing ? (
                <div className="space-y-3">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="w-full h-40 bg-slate-950 border border-amber-500/20 rounded-lg p-3 text-[11px] font-mono text-amber-100 focus:outline-none focus:border-amber-500/50 transition-colors scrollbar-hide resize-none leading-relaxed"
                        placeholder="Agrega reglas específicas..."
                    />
                    <div className="flex items-center justify-between">
                        {message && (
                            <span className={`text-[10px] font-bold ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {message.text}
                            </span>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="ml-auto flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all shadow-lg shadow-amber-900/40"
                        >
                            {isSaving ? (
                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Save className="w-3 h-3" />
                            )}
                            Guardar
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-slate-950/40 rounded-lg p-3 border border-slate-800/50">
                    <pre className="text-[11px] font-mono text-slate-400 whitespace-pre-wrap italic leading-relaxed">
                        {prompt || 'Sin instrucciones personalizadas configuradas.'}
                    </pre>
                </div>
            )}
        </div>
    )
}
