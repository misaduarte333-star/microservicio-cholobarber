import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

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

export default async function MonitorPage({ params, searchParams }: PageProps) {
    const { id: sucursalId } = await params
    const { phone: selectedPhone, date: selectedDate } = await searchParams

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const [sucursalRes, logsRes] = await Promise.all([
        supabase.from('sucursales').select('nombre').eq('id', sucursalId).single(),
        supabase.from('ia_request_logs')
            .select('*')
            .eq('sucursal_id', sucursalId)
            .order('created_at', { ascending: false })
            .limit(500)
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

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col">
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
            <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 57px)' }}>

                {/* Sidebar: conversation list */}
                <aside className="w-80 shrink-0 bg-slate-800 border-r border-slate-700/50 flex flex-col overflow-hidden">
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

                                        {/* Tool badges if any */}
                                        {msg.tools_used?.length > 0 && (
                                            <div className="flex justify-center">
                                                <div className="flex flex-wrap gap-1 justify-center bg-slate-800/50 rounded-xl px-3 py-2 border border-slate-700/40 max-w-[80%]">
                                                    <span className="text-[9px] text-slate-500 w-full text-center mb-1">🔧 Herramientas invocadas</span>
                                                    {msg.tools_used.map((t: any, idx: number) => (
                                                        <span key={idx} className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded-full font-bold text-[10px] border border-purple-500/20" title={t.name}>
                                                            {t.name}
                                                        </span>
                                                    ))}
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
            </div>
        </div>
    )
}
