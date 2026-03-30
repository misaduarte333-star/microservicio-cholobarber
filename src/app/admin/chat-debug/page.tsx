'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { MessageSquare, Send, Bot, User, Cpu, Sparkles, Loader2, Terminal, Code } from 'lucide-react'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    steps?: any[]
    timestamp: number
}

export default function ChatDebugPage() {
    const { sucursalId } = useAuth()
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'assistant',
            content: '¡Hola! Soy el asistente de depuración del CholoBot. Puedes probar mis herramientas y lógica aquí.',
            timestamp: Date.now()
        }
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [showSteps, setShowSteps] = useState<string | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(scrollToBottom, [messages])

    const handleSend = async () => {
        if (!input.trim() || loading || !sucursalId) return

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: Date.now()
        }

        setMessages(prev => [...prev, userMsg])
        setInput('')
        setLoading(true)

        try {
            // Direct chat API or using the same AgentService logic
            // We'll create a dedicated chat-debug route for this
            const res = await fetch('/api/admin/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: input,
                    sucursalId,
                    sessionId: `debug-${sucursalId}`
                })
            })

            const data = await res.json()
            
            if (data.error) throw new Error(data.error)

            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.response,
                steps: data.steps,
                timestamp: Date.now()
            }

            setMessages(prev => [...prev, assistantMsg])
        } catch (error: any) {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `Error: ${error.message}`,
                timestamp: Date.now()
            }])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="h-[calc(100vh-12rem)] flex flex-col space-y-4 animate-in fade-in duration-500">
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/20">
                        <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Chat Debug</h1>
                        <p className="text-sm text-muted-foreground">Prueba la lógica del agente en tiempo real.</p>
                    </div>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-medium text-muted-foreground">Model: GPT-4o Mini</span>
                </div>
            </header>

            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chat Area */}
                <div className="lg:col-span-2 flex flex-col glass-card border border-white/5 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                {msg.role === 'assistant' && (
                                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                                        <Bot className="w-5 h-5" />
                                    </div>
                                )}
                                <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'order-1' : ''}`}>
                                    <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                                        msg.role === 'user' 
                                            ? 'bg-purple-600 text-white rounded-tr-none' 
                                            : 'bg-white/5 text-foreground/90 border border-white/10 rounded-tl-none'
                                    }`}>
                                        {msg.content}
                                    </div>
                                    {msg.steps && msg.steps.length > 0 && (
                                        <button 
                                            onClick={() => setShowSteps(showSteps === msg.id ? null : msg.id)}
                                            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                            <Terminal className="w-3 h-3" />
                                            {showSteps === msg.id ? 'Ocultar Razonamiento' : `Ver ${msg.steps.length} Pasos Internos`}
                                        </button>
                                    )}
                                </div>
                                {msg.role === 'user' && (
                                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-muted-foreground shrink-0 border border-white/5">
                                        <User className="w-5 h-5" />
                                    </div>
                                )}
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-4">
                                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                </div>
                                <div className="space-y-2">
                                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                                        <span className="text-sm italic text-muted-foreground">CholoBot está pensando...</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-4 bg-white/5 border-t border-white/5">
                        <div className="relative group">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Escribe un mensaje de prueba..."
                                className="w-full bg-surface-hover border border-white/10 rounded-xl px-5 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-muted-foreground"
                            />
                            <button
                                onClick={handleSend}
                                disabled={loading || !input.trim()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-purple-400 hover:text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Debug / Steps Area */}
                <div className="glass-card border border-white/5 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-white/5 flex items-center gap-2 bg-blue-500/5">
                        <Code className="w-4 h-4 text-blue-400" />
                        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Traza de Herramientas</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {!showSteps ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 opacity-40">
                                <Sparkles className="w-12 h-12 text-purple-500" />
                                <p className="text-xs text-muted-foreground italic">
                                    Los pasos del agente aparecerán aquí cuando interactúes.
                                </p>
                            </div>
                        ) : (
                            messages.find(m => m.id === showSteps)?.steps?.map((step: any, i: number) => (
                                <div key={i} className="space-y-2 animate-in slide-in-from-right-4 duration-300">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${
                                            step.type === 'tool_call' ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'
                                        }`} />
                                        <span className="text-[10px] font-bold uppercase tracking-tighter text-foreground/70">
                                            {step.type === 'tool_call' ? `Call: ${step.name}` : `Result: ${step.name}`}
                                        </span>
                                    </div>
                                    <div className="p-3 rounded-lg bg-black/40 border border-white/5 overflow-x-auto">
                                        <pre className="text-[10px] font-mono text-blue-300 leading-tight">
                                            {JSON.stringify(step.input || step.output, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
