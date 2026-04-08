import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { Code, Clock, Zap } from 'lucide-react'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import ClearHistoryButton from '@/components/dev/ClearHistoryButton'
import RealtimeLogListener from '@/components/dev/RealtimeLogListener'

interface PageProps {
    params: Promise<{ id: string }>
    searchParams: Promise<{ phone?: string; date?: string }>
}

export const revalidate = 0

function formatDate(dateStr: string, tz = 'America/Mexico_City') {
    return new Date(dateStr).toLocaleDateString('es-MX', {
        timeZone: tz, weekday: 'short', day: '2-digit', month: 'short'
    })
}

function formatTime(dateStr: string, tz = 'America/Mexico_City') {
    return new Date(dateStr).toLocaleTimeString('es-MX', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
    })
}

function getLocalDate(dateStr: string, tz = 'America/Mexico_City') {
    return new Date(dateStr).toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
}

async function getLivePromptData(supabase: any, sucursalId: string) {
    const [barberosRes, serviciosRes, sucursalRes, configRes] = await Promise.all([
        supabase.from('barberos').select('id, nombre, horario_laboral, bloqueo_almuerzo, created_at, activo')
            .eq('sucursal_id', sucursalId).eq('activo', true).order('nombre'),
        supabase.from('servicios').select('id, nombre, duracion_minutos, precio, created_at, activo')
            .eq('sucursal_id', sucursalId).eq('activo', true).order('nombre'),
        supabase.from('sucursales').select('nombre, direccion, telefono_whatsapp, horario_apertura, created_at')
            .eq('id', sucursalId).single(),
        supabase.from('configuracion_ia').select('*').eq('sucursal_id', sucursalId).maybeSingle()
    ])

    const ctx = {
        sucursalId,
        timezone: configRes.data?.timezone || 'America/Mexico_City',
        nombre: sucursalRes.data?.nombre || 'Negocio',
        agentName: configRes.data?.agent_name || 'Agente IA',
        personality: configRes.data?.personality || 'Amable',
        customPrompt: configRes.data?.custom_prompt || '',
    }

    const systemPromptStr = buildSystemPrompt({
        nombre: ctx.nombre,
        agentName: ctx.agentName,
        personality: ctx.personality,
        timezone: ctx.timezone,
        customPrompt: ctx.customPrompt || undefined,
        barberos: barberosRes.data || [],
        servicios: serviciosRes.data || [],
        sucursal: sucursalRes.data || undefined
    })

    const currentDate = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone })
    const currentTime = new Intl.DateTimeFormat('es-MX', { timeZone: ctx.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())

    const finalSystemPrompt = systemPromptStr
        .replace(/{current_date}/g, currentDate)
        .replace(/{current_time}/g, currentTime)
        .replace(/{sender_phone}/g, '[Teléfono Cliente]')

    let lastUpdatedTimestamp = 0
    if (sucursalRes.data?.created_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(sucursalRes.data.created_at).getTime())
    barberosRes.data?.forEach((b: any) => { if (b.created_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(b.created_at).getTime()) })
    serviciosRes.data?.forEach((s: any) => { if (s.created_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(s.created_at).getTime()) })
    if (configRes.data?.updated_at) lastUpdatedTimestamp = Math.max(lastUpdatedTimestamp, new Date(configRes.data.updated_at).getTime())

    return { prompt: finalSystemPrompt, lastUpdated: new Date(lastUpdatedTimestamp || Date.now()).toISOString() }
}

export default async function MonitorPage({ params, searchParams }: PageProps) {
    const { id: sucursalId } = await params
    const { phone: selectedPhone, date: selectedDate } = await searchParams

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const [sucursalRes, logsRes, promptData] = await Promise.all([
        supabase.from('sucursales').select('nombre').eq('id', sucursalId).single(),
        supabase.from('ia_request_logs')
            .select('*')
            .eq('sucursal_id', sucursalId)
            .order('created_at', { ascending: false })
            .limit(500),
        getLivePromptData(supabase, sucursalId)
    ])

    const sucursal = sucursalRes.data
    const logs = logsRes.data || []

    // Stats
    const totalLogs = logs.length
    const errors = logs.filter(l => !!l.error)
    const errRate = totalLogs > 0 ? ((errors.length / totalLogs) * 100).toFixed(1) : '0'
    const avgLatency = totalLogs > 0 ? Math.round(logs.reduce((acc, l) => acc + (l.latency_ms || 0), 0) / totalLogs) : 0
    const uniquePhones = new Set(logs.map(l => l.phone)).size

    // Tool stats
    const toolsCount: Record<string, number> = {}
    logs.forEach(l => {
        (l.tools_used || []).forEach((t: any) => {
            toolsCount[t.name] = (toolsCount[t.name] || 0) + 1
        })
    })
    const toolsSorted = Object.entries(toolsCount).sort((a, b) => b[1] - a[1])

    // Group by phone + localDate → conversations
    type ConvKey = string // "phone||date"
    const convMap = new Map<ConvKey, typeof logs>()
    for (const log of [...logs].reverse()) { // ascending for message order
        const date = getLocalDate(log.created_at)
        const key = `${log.phone}||${date}`
        if (!convMap.has(key)) convMap.set(key, [])
        convMap.get(key)!.push(log)
    }

    // Build sidebar list (most recent first)
    const conversations = Array.from(convMap.entries())
        .map(([key, msgs]) => {
            const [phone, date] = key.split('||')
            const lastMsg = msgs[msgs.length - 1]
            return { phone, date, msgs, lastMsg, key }
        })
        .sort((a, b) => new Date(b.lastMsg.created_at).getTime() - new Date(a.lastMsg.created_at).getTime())

    // Which conversation is selected
    const activeConv = conversations.find(c =>
        c.phone === selectedPhone && c.date === selectedDate
    ) ?? conversations[0]

    // Diagnostic: last BUSCAR_CLIENTE call
    const lastIdentTool = activeConv?.msgs?.flatMap(m => m.tools_used || [])
        .filter((t: any) => t.name === 'BUSCAR_CLIENTE')
        .pop()

    return (
        <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
            <RealtimeLogListener sucursalId={sucursalId} />
            {/* Header */}
            <header className="border-b border-slate-700/50 bg-slate-800/90 sticky top-0 z-20 backdrop-blur-md shrink-0">
                <div className="max-w-full px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dev/negocios" className="p-2 rounded-lg bg-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700 transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="font-bold text-white text-lg">📡 Monitor IA — {sucursal?.nombre || 'Desconocido'}</h1>
                        </div>
                    </div>
                    {/* Stats row */}
                    <div className="hidden md:flex items-center gap-6 text-xs">
                        <span className="text-slate-400">Mensajes: <b className="text-white">{totalLogs}</b></span>
                        <span className="text-slate-400">Contactos: <b className="text-white">{uniquePhones}</b></span>
                        <span className="text-slate-400">Error: <b className="text-red-400">{errRate}%</b></span>
                        <span className="text-slate-400">Latencia avg: <b className="text-amber-400">{avgLatency}ms</b></span>
                    </div>
                    <Link
                        href={`/dev/negocios/${sucursalId}/ia-tester`}
                        className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-semibold rounded-lg px-3 py-2 transition shadow-lg shadow-fuchsia-900/40"
                    >
                        Chat Tester
                    </Link>
                </div>
            </header>

            {/* Body: sidebar + chat */}
            <div className="flex flex-1 overflow-hidden">

                {/* Sidebar: conversation list */}
                <aside className="w-72 shrink-0 bg-slate-800 border-r border-slate-700/50 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-900/40">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conversaciones</p>
                        <p className="text-[10px] text-slate-600 mt-0.5">{conversations.length} chats • agrupadas por día</p>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {conversations.length === 0 ? (
                            <div className="p-6 text-center text-slate-500 text-sm">Sin conversaciones aún.</div>
                        ) : (
                            conversations.map(conv => {
                                const isActive = conv.phone === activeConv?.phone && conv.date === activeConv?.date
                                const hasError = conv.msgs.some(m => !!m.error)
                                const href = `/dev/negocios/${sucursalId}/ia-monitor?phone=${encodeURIComponent(conv.phone)}&date=${conv.date}`
                                return (
                                    <Link
                                        key={conv.key}
                                        href={href}
                                        className={`flex items-start gap-3 px-4 py-3 border-b border-slate-700/30 hover:bg-slate-700/40 transition-colors ${isActive ? 'bg-purple-900/30 border-l-2 border-l-purple-500' : ''}`}
                                    >
                                        {/* Avatar */}
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${hasError ? 'bg-red-900/50 text-red-400' : 'bg-purple-900/60 text-purple-300'}`}>
                                            {conv.phone.slice(-2)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-0.5">
                                                <span className="text-xs font-mono font-semibold text-white truncate">{conv.phone}</span>
                                                <span className="text-[10px] text-slate-500 shrink-0 ml-1">{formatTime(conv.lastMsg.created_at)}</span>
                                            </div>
                                            <p className="text-[10px] text-purple-400 mb-1">{formatDate(conv.date + 'T00:00:00')}</p>
                                            <p className="text-[11px] text-slate-400 truncate">{conv.lastMsg.input_preview}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[9px] text-slate-600">{conv.msgs.length} msgs</span>
                                                {hasError && <span className="text-[9px] text-red-400 font-bold">⚠ error</span>}
                                            </div>
                                        </div>
                                    </Link>
                                )
                            })
                        )}
                    </div>

                    {/* Tool stats at bottom */}
                    {toolsSorted.length > 0 && (
                        <div className="border-t border-slate-700/50 p-4 bg-slate-900/40">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Top Herramientas</p>
                            <div className="space-y-1.5">
                                {toolsSorted.slice(0, 5).map(([name, count]) => (
                                    <div key={name} className="flex items-center justify-between">
                                        <span className="text-[11px] text-purple-400 truncate">{name}</span>
                                        <span className="text-[10px] text-slate-500 font-mono ml-2">{count}x</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </aside>

                {/* Chat area */}
                <main className="flex-1 flex flex-col overflow-hidden bg-slate-900">
                    {!activeConv ? (
                        <div className="flex-1 flex items-center justify-center text-slate-600">
                            <div className="text-center">
                                <p className="text-5xl mb-3">💬</p>
                                <p className="text-sm">Selecciona una conversación</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Chat header */}
                            <div className="px-6 py-3 border-b border-slate-700/50 bg-slate-800/60 backdrop-blur shrink-0 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-purple-900/60 flex items-center justify-center text-purple-300 font-bold text-sm">
                                    {activeConv.phone.slice(-2)}
                                </div>
                                <div>
                                    <p className="text-white font-mono font-semibold text-sm">{activeConv.phone}</p>
                                    <p className="text-[11px] text-purple-400">{formatDate(activeConv.date + 'T00:00:00')} • {activeConv.msgs.length} intercambios</p>
                                </div>
                                <div className="ml-auto">
                                    <ClearHistoryButton sucursalId={sucursalId} phone={activeConv.phone} />
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                                {activeConv.msgs.map((msg, i) => (
                                    <div key={msg.id} className="space-y-2">
                                        {/* Timestamp separator */}
                                        <div className="flex items-center justify-center">
                                            <span className="text-[10px] text-slate-600 bg-slate-800 px-3 py-0.5 rounded-full">
                                                {formatTime(msg.created_at)} · {msg.latency_ms}ms
                                                {msg.error && <span className="text-red-400 ml-2">⚠ error</span>}
                                            </span>
                                        </div>

                                        {/* User message (right) */}
                                        <div className="flex justify-end">
                                            <div className="max-w-[70%]">
                                                <div className="bg-slate-700 text-slate-100 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm shadow-md">
                                                    {msg.input_preview}
                                                </div>
                                                <p className="text-right text-[10px] text-slate-600 mt-1 pr-1">👤 Cliente</p>
                                            </div>
                                        </div>

                                        {/* Tool badges / inputs / outputs */}
                                        {msg.tools_used?.length > 0 && (
                                            <div className="flex justify-center w-full">
                                                <div className="flex flex-col bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/40 w-full max-w-[90%] shadow-lg">
                                                    <span className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest flex items-center justify-center gap-2 mb-3">
                                                        <Code className="w-4 h-4 text-fuchsia-400" /> Traza de Herramientas
                                                    </span>
                                                    <div className="space-y-3">
                                                        {msg.tools_used.map((t: any, idx: number) => (
                                                            <details key={idx} className="bg-slate-900/60 rounded-lg border border-slate-700/50 overflow-hidden group">
                                                                <summary className="text-[11px] font-bold text-blue-400 uppercase p-3 flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 transition-colors select-none outline-none">
                                                                    <Zap className="w-3 h-3" /> {t.name}
                                                                    <span className="ml-auto text-[9px] text-slate-500 normal-case font-normal group-open:hidden">▶ Ver detalles</span>
                                                                    <span className="ml-auto text-[9px] text-slate-500 normal-case font-normal hidden group-open:block">▼ Ocultar</span>
                                                                </summary>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 pt-0 border-t border-slate-800/80">
                                                                    <div className="mt-2">
                                                                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold flex mb-1">Argumentos (Input)</span>
                                                                        <pre className="text-[10px] font-mono text-amber-300/90 bg-black/40 p-2 rounded border border-slate-800 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto scrollbar-hide">
                                                                            {t.input != null && Object.keys(t.input).length > 0
                                                                                ? JSON.stringify(t.input, null, 2)
                                                                                : <span className="text-slate-600 italic">Sin argumentos registrados (log antiguo)</span>}
                                                                        </pre>
                                                                    </div>
                                                                    <div className="mt-2">
                                                                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold flex mb-1">Resultado (Output)</span>
                                                                        <pre className="text-[10px] font-mono text-emerald-300 bg-black/40 p-2 rounded border border-slate-800 whitespace-pre-wrap leading-relaxed min-h-[40px] max-h-60 overflow-y-auto scrollbar-hide">
                                                                            {typeof t.output === 'string' ? t.output : JSON.stringify(t.output, null, 2)}
                                                                        </pre>
                                                                    </div>
                                                                </div>
                                                            </details>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Error badge */}
                                        {msg.error && (
                                            <div className="flex justify-center">
                                                <span className="text-[10px] text-red-400 bg-red-900/20 border border-red-900/40 px-3 py-1 rounded-full">
                                                    ❌ {msg.error}
                                                </span>
                                            </div>
                                        )}

                                        {/* Bot response (left) */}
                                        <div className="flex justify-start">
                                            <div className="max-w-[70%]">
                                                <div className="bg-purple-900/40 border border-purple-800/30 text-slate-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm shadow-md">
                                                    {msg.output_preview}
                                                </div>
                                                <p className="text-left text-[10px] text-slate-600 mt-1 pl-1">🤖 CholoBot</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </main>

                {/* Right Sidebar: Context / System Prompt */}
                <aside className="w-96 shrink-0 bg-slate-800 border-l border-slate-700/50 flex flex-col overflow-hidden">
                    <header className="px-4 py-3 border-b border-slate-700/50 bg-slate-900/40 flex items-center gap-2">
                        <Code className="w-4 h-4 text-emerald-400" />
                        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Prompt Dinámico</h2>
                    </header>
                    <div className="p-4 flex-1 overflow-y-auto scrollbar-hide space-y-4">
                        {/* Identificación Diagnostic */}
                        <div className="bg-slate-900/80 rounded-xl p-4 border border-fuchsia-500/30 shadow-lg shadow-fuchsia-500/5">
                            <h3 className="text-[10px] text-fuchsia-400 uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
                                <Zap className="w-3.5 h-3.5" /> Identificación del Cliente
                            </h3>
                            
                            {!lastIdentTool ? (
                                <p className="text-[11px] text-slate-500 italic">No se ha llamado a BUSCAR_CLIENTE en esta sesión.</p>
                            ) : (
                                <div className="space-y-3">
                                    <div>
                                        <span className="text-[9px] text-slate-500 uppercase font-semibold block mb-1">Argumentos (Agent Send)</span>
                                        <pre className="text-[10px] font-mono text-amber-300/90 bg-black/40 p-2 rounded border border-slate-700/50 overflow-x-auto">
                                            {JSON.stringify(lastIdentTool.input, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <span className="text-[9px] text-slate-500 uppercase font-semibold block mb-1">Respuesta (Tool Return)</span>
                                        <pre className="text-[10px] font-mono text-emerald-400 bg-black/40 p-2 rounded border border-slate-700/50 overflow-x-auto">
                                            {typeof lastIdentTool.output === 'string' 
                                                ? lastIdentTool.output 
                                                : JSON.stringify(lastIdentTool.output, null, 2)}
                                        </pre>
                                    </div>
                                    {lastIdentTool.output?.encontrado === true && (
                                        <div className="mt-2 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1.5 rounded flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            Cliente Identificado ✅
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-lg w-full">
                            <Clock className="w-3 h-3" />
                            Última act. del sistema: {new Date(promptData.lastUpdated).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute:'2-digit' })}
                        </div>
                        <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-700/50">
                            <h3 className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Prompt Dinámico (Contexto)</h3>
                            <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {promptData.prompt}
                            </pre>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    )
}
