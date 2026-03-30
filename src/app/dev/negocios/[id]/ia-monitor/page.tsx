import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

interface PageProps {
    params: Promise<{ id: string }>
}

export const revalidate = 0 // always fetch live data from DB

export default async function MonitorPage({ params }: PageProps) {
    const { id: sucursalId } = await params

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Parallel fetch: business metadata & logs
    const [sucursalRes, logsRes] = await Promise.all([
        supabase.from('sucursales').select('nombre, slug').eq('id', sucursalId).single(),
        supabase.from('ia_request_logs')
            .select('*')
            .eq('sucursal_id', sucursalId)
            .order('created_at', { ascending: false })
            .limit(100)
    ])

    const sucursal = sucursalRes.data
    const logs = logsRes.data || []

    const totalLogs = logs.length
    const errors = logs.filter(l => !!l.error)
    const errRate = totalLogs > 0 ? ((errors.length / totalLogs) * 100).toFixed(1) : '0'
    const avgLatency = totalLogs > 0 ? Math.round(logs.reduce((acc, l) => acc + (l.latency_ms || 0), 0) / totalLogs) : 0
    const activeSessions = new Set(logs.map(l => l.session_id)).size

    const toolsCount: Record<string, number> = {}
    logs.forEach(l => {
        const tools = l.tools_used || []
        tools.forEach((t: any) => {
            toolsCount[t.name] = (toolsCount[t.name] || 0) + 1
        })
    })

    const toolsSorted = Object.entries(toolsCount).sort((a, b) => b[1] - a[1])

    return (
        <div className="min-h-screen bg-slate-900 pb-12">
            <header className="border-b border-slate-700/50 bg-slate-800/80 sticky top-0 z-10 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dev/negocios" className="p-2 rounded-lg bg-slate-700/50 text-slate-300 hover:text-white hover:bg-slate-700 transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </Link>
                        <div>
                            <h1 className="font-bold text-white text-xl">Monitor Neuronal: {sucursal?.nombre || 'Desconocido'}</h1>
                            <p className="text-sm text-purple-400 font-mono">ID: {sucursalId}</p>
                        </div>
                    </div>
                    <Link
                        href={`/dev/negocios/${sucursalId}/ia-tester`}
                        className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-sm font-semibold rounded-lg px-4 py-2 transition shadow-lg shadow-fuchsia-900/40"
                    >
                        Abrir Chat Tester
                    </Link>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8 animate-fade-in">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all" />
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Mensajes (Últ. 100)</p>
                        <p className="text-3xl font-black text-white">{totalLogs}</p>
                    </div>
                    <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Sesiones Únicas</p>
                        <p className="text-3xl font-black text-white">{activeSessions}</p>
                    </div>
                    <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-500/10 rounded-full blur-2xl group-hover:bg-red-500/20 transition-all" />
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Tasa de Error</p>
                        <p className="text-3xl font-black text-red-400">{errRate}%</p>
                    </div>
                    <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all" />
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Latencia Promedio</p>
                        <p className="text-3xl font-black text-amber-400">{avgLatency} <span className="text-lg">ms</span></p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left: Table Logs */}
                    <div className="lg:col-span-2 space-y-4">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Registro de Conversaciones
                        </h2>
                        
                        {logs.length === 0 ? (
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-12 text-center">
                                <p className="text-slate-400">Aún no hay mensajes interceptados.</p>
                            </div>
                        ) : (
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-300">
                                        <thead className="bg-slate-900/50 text-xs uppercase text-slate-500 font-bold border-b border-slate-700/50">
                                            <tr>
                                                <th className="px-6 py-4">Telescopio</th>
                                                <th className="px-6 py-4">Origen / Teléfono</th>
                                                <th className="px-6 py-4">Latencia</th>
                                                <th className="px-6 py-4 text-center">Herramientas</th>
                                                <th className="px-6 py-4 text-right">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {logs.map(l => (
                                                <tr key={l.id} className="hover:bg-slate-700/20 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="max-w-[250px]">
                                                            <p className="font-semibold text-white truncate" title={l.input_preview}>👦 {l.input_preview}</p>
                                                            <p className="text-slate-400 truncate mt-1 text-xs" title={l.output_preview}>🤖 {l.output_preview}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-mono text-xs">{l.phone}</span>
                                                            <span className="text-[10px] uppercase text-emerald-500 mt-1">{l.source}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs font-mono">
                                                        {l.latency_ms} ms
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {l.tools_used?.length > 0 ? (
                                                            <span className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded-lg font-bold text-xs border border-purple-500/20">
                                                                {l.tools_used.length} calls
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-600">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {l.error ? (
                                                            <span className="px-2 py-1 bg-red-500/10 text-red-400 rounded-lg font-bold text-xs border border-red-500/20" title={l.error}>
                                                                Error
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg font-bold text-xs border border-emerald-500/20">
                                                                OK
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: Top Tools / Errors */}
                    <div className="space-y-6">
                        <div className="bg-slate-800 border border-slate-700/50 rounded-2xl p-6 shadow-xl">
                            <h3 className="text-white font-bold mb-4 uppercase text-xs tracking-wider">Top Herramientas Invocadas</h3>
                            {toolsSorted.length === 0 ? (
                                <p className="text-slate-500 text-sm italic">Ninguna por ahora.</p>
                            ) : (
                                <ul className="space-y-3">
                                    {toolsSorted.map(([name, count]) => (
                                        <li key={name} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-slate-700">
                                            <span className="text-sm font-semibold text-purple-400">{name}</span>
                                            <span className="text-xs bg-slate-800 px-2 py-1 rounded-md text-slate-300 font-mono">{count}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {errors.length > 0 && (
                            <div className="bg-red-950/30 border border-red-900/50 rounded-2xl p-6 shadow-xl">
                                <h3 className="text-red-400 font-bold mb-4 uppercase text-xs tracking-wider">Últimos Errores Fractales</h3>
                                <ul className="space-y-3">
                                    {errors.slice(0, 5).map(e => (
                                        <li key={e.id} className="text-xs text-slate-300 bg-black/20 p-3 rounded-lg border border-red-900/30">
                                            <p className="font-mono text-red-500 mb-1">{e.phone}</p>
                                            <p className="truncate">{e.error}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
