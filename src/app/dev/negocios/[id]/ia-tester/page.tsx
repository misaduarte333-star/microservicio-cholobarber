'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Zap } from 'lucide-react'

interface Message {
    id: string
    role: 'user' | 'ai' | 'system'
    text: string
    time: Date
}

interface AgentStep {
    type: 'thinking' | 'tool_call' | 'tool_result' | 'response'
    name?: string
    input?: any
    output?: any
    timestamp: number
    hasError?: boolean
    databaseInteraction?: string | string[]
}

interface StepGroup {
    messageId: string
    steps: AgentStep[]
    timestamp: Date
    systemPrompt?: string
}

const STEP_ICONS: Record<string, string> = {
    tool_call: '🔧',
    tool_result: '📋',
    response: '💬',
    thinking: '🧠',
}

const STEP_LABELS: Record<string, string> = {
    tool_call: 'Llamada a herramienta',
    tool_result: 'Resultado',
    response: 'Respuesta final',
    thinking: 'Razonando',
}

function hasErrorInOutput(output: any): boolean {
    if (!output) return false
    if (typeof output === 'string') {
        return output.toLowerCase().startsWith('error') || output.includes('error_tecnico')
    }
    if (typeof output === 'object') {
        return !!(output.error || output.status === 'error' || output.status === 'error_tecnico_db' || output.error_code)
    }
    return false
}

function StepCard({ step }: { step: AgentStep }) {
    const [expanded, setExpanded] = useState(() => step.hasError || hasErrorInOutput(step.output))
    const isError = step.hasError || hasErrorInOutput(step.output)

    return (
        <div
            className={`rounded-lg border transition-colors ${
                isError
                    ? 'border-red-500/50 bg-red-500/10'
                    : step.type === 'tool_call'
                    ? 'border-blue-500/30 bg-blue-500/5'
                    : step.type === 'tool_result'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : step.type === 'response'
                    ? 'border-fuchsia-500/30 bg-fuchsia-500/5'
                    : 'border-slate-600 bg-slate-800/50'
            }`}
        >
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
            >
                <span className="text-base">{isError ? '❌' : STEP_ICONS[step.type]}</span>
                <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isError ? 'text-red-400' : 'text-slate-300'}`}>
                        {isError && step.type === 'tool_result' ? 'Error en herramienta' : STEP_LABELS[step.type]}
                        {step.name && (
                            <span className={`ml-1.5 font-mono text-[11px] ${isError ? 'text-red-300' : 'text-amber-400'}`}>{step.name}</span>
                        )}
                        {step.databaseInteraction && (
                            <span className="ml-2 text-[9px] text-slate-500 font-mono bg-slate-800/80 px-1 py-0.5 rounded border border-slate-700/50">
                                DB: {Array.isArray(step.databaseInteraction) ? step.databaseInteraction.join(', ') : step.databaseInteraction}
                            </span>
                        )}
                    </p>
                    {isError && !expanded && (
                        <p className="text-[10px] text-red-400/70 truncate mt-0.5">
                            {typeof step.output === 'object'
                                ? step.output.error || step.output.message || step.output.error_code || 'Error desconocido'
                                : typeof step.output === 'string' ? step.output.substring(0, 80) : 'Error'}
                        </p>
                    )}
                </div>
                <svg
                    className={`w-3.5 h-3.5 text-slate-500 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {expanded && (
                <div className="px-3 pb-2.5 space-y-1.5">
                    {step.input && (
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-0.5">Input</p>
                            <pre className="text-[11px] text-slate-400 bg-slate-900/60 rounded p-2 overflow-x-auto max-h-40 scrollbar-hide font-mono leading-relaxed">
                                {typeof step.input === 'string' ? step.input : JSON.stringify(step.input, null, 2)}
                            </pre>
                        </div>
                    )}
                    {step.output && (
                        <div>
                            <p className={`text-[10px] font-bold uppercase mb-0.5 ${isError ? 'text-red-500' : 'text-slate-500'}`}>
                                {isError ? 'Error Output' : 'Output'}
                            </p>
                            <pre className={`text-[11px] rounded p-2 overflow-x-auto max-h-40 scrollbar-hide font-mono leading-relaxed ${
                                isError ? 'text-red-300 bg-red-950/40 border border-red-500/20' : 'text-slate-400 bg-slate-900/60'
                            }`}>
                                {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default function ChatTester() {
    const params = useParams()
    const sucursalId = params.id as string

    const [messages, setMessages] = useState<Message[]>([
        { id: '1', role: 'system', text: 'Bienvenido al Tester de IA. Estás interactuando con el LLM aislado sin usar WhatsApp.', time: new Date() }
    ])
    const [stepGroups, setStepGroups] = useState<StepGroup[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [phone] = useState('555-DEV-TEST') // Identidad de prueba por defecto
    const [persistentPrompt, setPersistentPrompt] = useState<string | null>(null)
    const [promptUpdatedAt, setPromptUpdatedAt] = useState<string | null>(null)
    const [editableCustomPrompt, setEditableCustomPrompt] = useState<string>('')
    const [isSavingPrompt, setIsSavingPrompt] = useState(false)
    const [isEditingPrompt, setIsEditingPrompt] = useState(false)
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const stepsEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        // Cargar configuración inicial
        fetch(`/api/dev/sucursal/${sucursalId}/config`)
            .then(res => res.json())
            .then(data => {
                if (data.agent_custom_prompt) {
                    setEditableCustomPrompt(data.agent_custom_prompt)
                }
            })
            .catch(err => console.error('Error cargando config:', err))
    }, [sucursalId])

    useEffect(() => {
        scrollToBottom()
    }, [messages, stepGroups, isLoading])

    const handleSavePrompt = async () => {
        setIsSavingPrompt(true)
        setSaveMessage(null)
        try {
            const res = await fetch(`/api/dev/sucursal/${sucursalId}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customPrompt: editableCustomPrompt })
            })
            if (!res.ok) throw new Error('Error al guardar')
            setSaveMessage({ type: 'success', text: 'Prompt guardado correctamente ✅' })
            setIsEditingPrompt(false)
            setTimeout(() => setSaveMessage(null), 3000)
        } catch (error: any) {
            setSaveMessage({ type: 'error', text: 'Fallo al guardar: ' + error.message })
        } finally {
            setIsSavingPrompt(false)
        }
    }

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || isLoading) return

        const userText = input.trim()
        setInput('')

        const msgId = Date.now().toString()
        const userMsg: Message = { id: msgId, role: 'user', text: userText, time: new Date() }
        setMessages(prev => [...prev, userMsg])
        setIsLoading(true)

        // Add a pending step group
        setStepGroups(prev => [...prev, {
            messageId: msgId,
            steps: [{ type: 'thinking', timestamp: Date.now() }],
            timestamp: new Date()
        }])

        try {
            const res = await fetch('/api/dev/chat-debug', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userText,
                    sucursalId,
                    senderPhone: phone,
                    sessionId: `dev-session-${phone}`
                })
            })

            if (!res.ok) {
                let errMsg = 'Error del servidor IA'
                try {
                    const err = await res.json()
                    errMsg = err.error || errMsg
                } catch {
                    errMsg = `Error ${res.status}: ${res.statusText || 'Servidor no disponible'}`
                }
                throw new Error(errMsg)
            }

            const data = await res.json()

            const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'ai', text: data.response, time: new Date() }
            setMessages(prev => [...prev, aiMsg])

            // Replace pending steps with real steps
            setStepGroups(prev => {
                const updated = [...prev]
                const idx = updated.findIndex(g => g.messageId === msgId)
                if (idx !== -1 && data.steps) {
                    updated[idx] = { ...updated[idx], steps: data.steps }
                }
                return updated
            })

            // Update persistent prompt if provided
            if (data.systemPrompt) {
                setPersistentPrompt(data.systemPrompt)
                if (data.promptUpdatedAt) setPromptUpdatedAt(data.promptUpdatedAt)
            }

        } catch (error: any) {
            const errorMsg: Message = { id: Date.now().toString(), role: 'system', text: 'Error: ' + error.message, time: new Date() }
            setMessages(prev => [...prev, errorMsg])

            setStepGroups(prev => {
                const updated = [...prev]
                const idx = updated.findIndex(g => g.messageId === msgId)
                if (idx !== -1) {
                    updated[idx] = { ...updated[idx], steps: [{ type: 'response', output: error.message, timestamp: Date.now() }] }
                }
                return updated
            })
        } finally {
            setIsLoading(false)
        }
    }



    const totalToolCalls = stepGroups.reduce((acc, g) => acc + g.steps.filter(s => s.type === 'tool_call').length, 0)
    const totalErrors = stepGroups.reduce((acc, g) => acc + g.steps.filter(s => s.hasError || hasErrorInOutput(s.output)).length, 0)

    // Identificación Diagnostic
    const lastIdentResult = stepGroups.flatMap(g => g.steps)
        .filter(s => s.type === 'tool_result' && s.name === 'BUSCAR_CLIENTE')
        .pop()

    return (
        <div className="min-h-screen bg-slate-900 flex items-start justify-center gap-4 pt-8 px-4">

            {/* ===== LEFT: Chat ===== */}
            <div className="w-full max-w-xs bg-slate-800 rounded-3xl shadow-2xl border border-slate-700/50 overflow-hidden flex flex-col h-[750px] max-h-[90vh] shrink-0">

                {/* Header */}
                <header className="bg-slate-800 border-b border-slate-700 p-4 shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/dev/negocios" className="text-slate-400 hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-fuchsia-900/40">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-white font-bold leading-tight">Agente IA (Tester)</h2>
                            <p className="text-[10px] text-fuchsia-400 font-mono tracking-wider">{sucursalId.slice(0, 8)}... EN LINEA</p>
                            <p className="text-[9px] text-slate-500 font-mono mt-0.5">SENDER: {phone}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                setMessages([{ id: '1', role: 'system', text: 'Historial limpiado. Sesión reiniciada.', time: new Date() }])
                                setStepGroups([])
                                setPersistentPrompt(null)
                            }}
                            className="p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white"
                            title="Limpiar chat local"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </header>
                {saveMessage && (
                    <div className={`px-4 py-2 text-xs font-semibold text-center ${
                        saveMessage.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                        {saveMessage.text}
                    </div>
                )}

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50 scrollbar-hide" style={{ backgroundImage: "radial-gradient(ellipse at center, rgba(30,41,59,0) 0%, rgba(15,23,42,1) 100%)" }}>
                    {messages.map((m) => (
                        <div key={m.id} className={`flex flex-col max-w-[85%] ${m.role === 'user' ? 'ml-auto items-end' : m.role === 'system' ? 'mx-auto items-center' : 'mr-auto items-start'}`}>
                            {m.role === 'system' ? (
                                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500/80 text-[10px] uppercase font-bold px-3 py-1.5 rounded-full text-center max-w-full leading-snug">
                                    {m.text}
                                </div>
                            ) : (
                                <>
                                    <div className={`px-4 py-2.5 rounded-2xl whitespace-pre-wrap text-[15px] ${
                                        m.role === 'user'
                                            ? 'bg-emerald-600 text-white rounded-br-none shadow-md shadow-emerald-900/20'
                                            : 'bg-slate-700 text-slate-100 rounded-bl-none shadow-md shadow-black/20'
                                    }`}>
                                        {m.text}
                                    </div>
                                    <span className="text-[10px] text-slate-500 mt-1 font-mono uppercase px-1">
                                        {m.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </>
                            )}
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex flex-col mr-auto items-start max-w-[85%]">
                            <div className="bg-slate-700 px-4 py-3 rounded-2xl rounded-bl-none flex gap-1 items-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="bg-slate-800 border-t border-slate-700 p-3 shrink-0">
                    <form onSubmit={handleSend} className="flex gap-2 items-end">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend(e)
                                }
                            }}
                            placeholder="Escribe un mensaje de prueba..."
                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-2xl px-4 py-3 text-[15px] resize-none h-[50px] max-h-[120px] focus:outline-none focus:border-fuchsia-500/50 transition-colors scrollbar-hide"
                            rows={1}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="w-12 h-12 rounded-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-slate-700 disabled:text-slate-500 text-white flex items-center justify-center shrink-0 transition-colors shadow-lg shadow-fuchsia-900/30"
                        >
                            <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </form>
                </div>
            </div>

            {/* ===== CENTER: Agent Steps Panel ===== */}
            <div className="w-full max-w-xs bg-slate-800 rounded-3xl shadow-2xl border border-slate-700/50 overflow-hidden flex flex-col h-[750px] max-h-[90vh] shrink-0">

                {/* Header */}
                <header className="bg-slate-800 border-b border-slate-700 p-4 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/40">
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-white font-bold leading-tight">Paso a Paso</h2>
                                <p className="text-[10px] text-cyan-400 font-mono tracking-wider">AGENT TRACE</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-1 rounded-full font-mono">
                                {totalToolCalls} tools
                            </span>
                            {totalErrors > 0 && (
                                <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-full font-mono font-bold">
                                    {totalErrors} error{totalErrors > 1 ? 'es' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                </header>

                {/* Steps Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-900/50 scrollbar-hide">
                    {stepGroups.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                            <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <p className="text-sm text-center">Envia un mensaje para ver<br/>el razonamiento del agente</p>
                        </div>
                    )}

                    {stepGroups.map((group, gi) => (
                        <div key={gi} className="space-y-2">
                            {/* Group header */}
                            {(() => {
                                const groupErrors = group.steps.filter(s => s.hasError || hasErrorInOutput(s.output)).length
                                return (
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                            groupErrors > 0
                                                ? 'bg-red-600/20 border border-red-500/30'
                                                : 'bg-cyan-600/20 border border-cyan-500/30'
                                        }`}>
                                            <span className={`text-[10px] font-bold ${groupErrors > 0 ? 'text-red-400' : 'text-cyan-400'}`}>{gi + 1}</span>
                                        </div>
                                        <p className="text-[10px] font-mono text-slate-500 uppercase">
                                            Interaccion {gi + 1} &middot; {group.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </p>
                                        <span className="text-[10px] bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                                            {group.steps.filter(s => s.type === 'tool_call').length} tools
                                        </span>
                                        {groupErrors > 0 && (
                                            <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded font-mono">
                                                {groupErrors} error{groupErrors > 1 ? 'es' : ''}
                                            </span>
                                        )}
                                    </div>
                                )
                            })()}

                            {/* Steps timeline */}
                            <div className="relative pl-4 border-l-2 border-slate-700 space-y-2">
                                {group.steps.map((step, si) => (
                                    <div key={si} className="relative">
                                        {/* Timeline dot */}
                                        <div className={`absolute -left-[calc(1rem+5px)] w-2.5 h-2.5 rounded-full border-2 ${
                                            (step.hasError || hasErrorInOutput(step.output)) ? 'bg-red-500 border-red-400' :
                                            step.type === 'tool_call' ? 'bg-blue-500 border-blue-400' :
                                            step.type === 'tool_result' ? 'bg-emerald-500 border-emerald-400' :
                                            step.type === 'response' ? 'bg-fuchsia-500 border-fuchsia-400' :
                                            'bg-slate-500 border-slate-400 animate-pulse'
                                        }`} />
                                        {step.type === 'thinking' ? (
                                            <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-slate-800/50 border border-slate-700">
                                                <div className="flex gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                </div>
                                                <span className="text-xs text-slate-400">Procesando...</span>
                                            </div>
                                        ) : (
                                            <StepCard step={step} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div ref={stepsEndRef} />
                </div>
            </div>

            {/* ===== RIGHT: System Prompt Panel ===== */}
            <div className="w-full max-w-xl bg-slate-800 rounded-3xl shadow-2xl border border-slate-700/50 overflow-hidden flex flex-col h-[750px] max-h-[90vh] shrink-0">
                <header className="bg-slate-800 border-b border-slate-700 p-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-900/40">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-white font-bold leading-tight">System Prompt</h2>
                            <p className="text-[10px] text-amber-400 font-mono tracking-wider">DATOS ACTUALES</p>
                        </div>
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto p-4 bg-slate-900/50 scrollbar-hide space-y-6">
                    {/* Editor Manual */}
                    <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-4 shadow-lg shadow-amber-500/5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                Instrucciones Personalizadas
                            </h3>
                            <button
                                onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded transition-colors border border-slate-700"
                            >
                                {isEditingPrompt ? 'Cancelar' : 'Editar'}
                            </button>
                        </div>

                        {isEditingPrompt ? (
                            <div className="space-y-3">
                                <textarea
                                    value={editableCustomPrompt}
                                    onChange={(e) => setEditableCustomPrompt(e.target.value)}
                                    className="w-full h-48 bg-slate-950 border border-amber-500/30 rounded-lg p-3 text-[11px] font-mono text-amber-100 focus:outline-none focus:border-amber-500/60 transition-colors scrollbar-hide resize-none leading-relaxed"
                                    placeholder="Agrega reglas específicas para este negocio..."
                                />
                                <div className="flex justify-end gap-2">
                                    <button
                                        onClick={handleSavePrompt}
                                        disabled={isSavingPrompt}
                                        className="bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white text-[10px] font-bold px-4 py-1.5 rounded-lg transition-all shadow-lg shadow-amber-900/40 flex items-center gap-2"
                                    >
                                        {isSavingPrompt ? (
                                            <>
                                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Guardando...
                                            </>
                                        ) : 'Guardar Cambios'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-slate-950/40 rounded-lg p-3 border border-slate-800/50">
                                <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap italic">
                                    {editableCustomPrompt || 'Sin instrucciones personalizadas configuradas.'}
                                </pre>
                            </div>
                        )}
                    </div>

                    {/* Identificación Diagnostic */}
                    <div className="bg-slate-900 border border-fuchsia-500/30 rounded-2xl p-4 shadow-lg shadow-fuchsia-500/5">
                        <h3 className="text-xs font-bold text-fuchsia-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />
                            Diagnóstico: Identificación
                        </h3>

                        {!lastIdentResult ? (
                            <p className="text-[11px] text-slate-500 italic px-1">Sin llamadas a BUSCAR_CLIENTE registradas en esta sesión.</p>
                        ) : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-[9px] text-slate-500 uppercase font-bold mb-1 ml-1">Agent Request</p>
                                        <pre className="text-[10px] font-mono text-amber-300 bg-black/40 p-2 rounded-lg border border-slate-800 truncate">
                                            {JSON.stringify(stepGroups.flatMap(g => g.steps).filter(s => s.type === 'tool_call' && s.timestamp <= lastIdentResult.timestamp).pop()?.input, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-slate-500 uppercase font-bold mb-1 ml-1">Tool Response</p>
                                        <div className={`text-[10px] font-mono p-2 rounded-lg border flex items-center gap-2 ${
                                            lastIdentResult.output?.encontrado ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                        }`}>
                                            {lastIdentResult.output?.encontrado ? 'IDENTIFICADO ✅' : 'NUEVO / NO ENCONTRADO 👤'}
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-1 ml-1">Datos Devueltos</p>
                                    <pre className="text-[10px] font-mono text-slate-300 bg-black/40 p-2 rounded-lg border border-slate-800 overflow-x-auto">
                                        {JSON.stringify(lastIdentResult.output, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <div className="text-[10px] font-mono text-slate-500 uppercase">
                                Vista Previa del Prompt Final (Sistema)
                            </div>
                            {(promptUpdatedAt || persistentPrompt) && (
                                <div className="text-[10px] bg-amber-500/10 text-amber-500/80 px-2 py-0.5 rounded border border-amber-500/20 font-mono">
                                    {promptUpdatedAt ? `ACTUALIZADO: ${new Date(promptUpdatedAt).toLocaleString()}` : 'GENERADO EN ESTA SESIÓN'}
                                </div>
                            )}
                        </div>
                        {!persistentPrompt ? (
                            <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-8 flex flex-col items-center justify-center text-slate-600 gap-2">
                                <Zap className="w-5 h-5 opacity-20" />
                                <p className="text-[11px] uppercase tracking-widest font-bold">En espera de interacción...</p>
                            </div>
                        ) : (
                            <pre className="text-[10px] text-amber-200/60 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
                                {persistentPrompt}
                            </pre>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
