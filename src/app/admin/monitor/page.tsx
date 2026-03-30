'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Activity, MessageSquare, Clock, Zap, Cpu, AlertCircle, Terminal, Bot } from 'lucide-react'

// Dummy MetricsCard if KPICard doesn't fit
function MonitorCard({ title, value, icon: Icon, color, trend }: any) {
    const colorClasses: any = {
        purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
        green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        red: 'text-red-400 bg-red-500/10 border-red-500/20',
    }
    const colorClass = colorClasses[color] || colorClasses.purple

    return (
        <div className={`glass-card p-6 border ${colorClass.split(' ')[2]}`}>
            <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${colorClass.split(' ')[1]}`}>
                    <Icon className={`w-5 h-5 ${colorClass.split(' ')[0]}`} />
                </div>
                {trend && (
                    <span className="text-xs font-medium bg-white/5 px-2 py-1 rounded-full text-white/60">
                        {trend > 0 ? '+' : ''}{trend}%
                    </span>
                )}
            </div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <h3 className="text-2xl font-bold text-foreground mt-1 tabular-nums">{value}</h3>
        </div>
    )
}

export default function AIMonitorPage() {
    const { sucursalId } = useAuth()
    const [stats, setStats] = useState<any>(null)
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const fetchData = useCallback(async () => {
        if (!sucursalId) return
        try {
            const [statsRes, logsRes] = await Promise.all([
                fetch(`/api/admin/ai/stats?sucursalId=${sucursalId}`),
                fetch(`/api/admin/ai/logs?sucursalId=${sucursalId}&limit=15`)
            ])
            const statsData = await statsRes.json()
            const logsData = await logsRes.json()
            setStats(statsData.stats)
            setLogs(logsData.logs)
        } catch (error) {
            console.error('Error fetching AI data:', error)
        } finally {
            setLoading(false)
        }
    }, [sucursalId])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 10000)
        return () => clearInterval(interval)
    }, [fetchData])

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <header>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/20">
                        <Activity className="w-6 h-6" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">AI Monitor</h1>
                </div>
                <p className="text-muted-foreground">Monitoreo en tiempo real de la actividad del CholoBot.</p>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {loading ? (
                    Array(4).fill(0).map((_, i) => <div key={i} className="glass-card h-32 animate-pulse" />)
                ) : (
                    <>
                        <MonitorCard title="Interacciones (24h)" value={stats?.totalRequests || 0} icon={MessageSquare} color="purple" trend={stats?.totalRequests > 0 ? 12 : 0} />
                        <MonitorCard title="Tasa de Éxito" value={`${stats?.successRate || 100}%`} icon={Zap} color="green" />
                        <MonitorCard title="Latencia Media" value={`${stats?.avgLatency || 0}ms`} icon={Clock} color="blue" />
                        <MonitorCard title="Detección Errores" value={stats?.errors || 0} icon={AlertCircle} color="red" />
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Live Activity Logs */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-purple-400" />
                            Registro de Actividad
                        </h2>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">En vivo</span>
                        </div>
                    </div>

                    <div className="glass-card overflow-hidden border border-white/5">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-white/5 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                                    <tr>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Mensaje Cliente</th>
                                        <th className="px-6 py-4">Fuente</th>
                                        <th className="px-6 py-4">Latencia</th>
                                        <th className="px-6 py-4 text-right">Hora</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading ? (
                                        Array(5).fill(0).map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td colSpan={5} className="px-6 py-4 h-12 bg-white/5" />
                                            </tr>
                                        ))
                                    ) : (
                                        logs.map((log) => (
                                            <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-6 py-4">
                                                    {log.error ? (
                                                        <span className="flex items-center gap-1.5 text-red-400">
                                                            <AlertCircle className="w-4 h-4" />
                                                            <span className="text-xs font-medium">Error</span>
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1.5 text-emerald-400">
                                                            <Zap className="w-4 h-4 fill-current opacity-20" />
                                                            <span className="text-xs font-medium">Éxito</span>
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-foreground/80 line-clamp-1 max-w-xs">{log.input_preview}</p>
                                                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{log.phone}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-muted-foreground border border-white/10 uppercase">
                                                        {log.source || 'webhook'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 tabular-nums text-sm text-foreground/60 font-medium">
                                                    {log.latency_ms}ms
                                                </td>
                                                <td className="px-6 py-4 text-right text-xs text-muted-foreground">
                                                    {new Date(log.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Toolbox Info */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-blue-400" />
                        Capacidades CholoBot
                    </h2>
                    
                    <div className="space-y-4">
                        <div className="glass-card p-5 bg-gradient-to-br from-blue-500/5 to-purple-500/5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                                    <Bot className="w-5 h-5" />
                                </div>
                                <h3 className="font-semibold text-foreground">Estado del Agente</h3>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Modelo</span>
                                    <span className="text-foreground font-medium">GPT-4o Mini</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Proveedor</span>
                                    <span className="text-foreground font-medium">OpenAI</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Herramientas</span>
                                    <span className="text-foreground font-medium">8 Activas</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass-card p-5">
                            <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-widest">Herramientas Más Usadas</h3>
                            <div className="space-y-3">
                                {[
                                    { name: 'AGENDAR_CITA', usage: 45, color: 'bg-purple-400' },
                                    { name: 'CONSULTAR_BARBEROS', usage: 30, color: 'bg-blue-400' },
                                    { name: 'DISPONIBILIDAD_HOY', usage: 25, color: 'bg-emerald-400' }
                                ].map((tool, i) => (
                                    <div key={i} className="space-y-1.5">
                                        <div className="flex justify-between text-xs group cursor-default">
                                            <span className="text-foreground/80 font-medium group-hover:text-purple-300 transition-colors">{tool.name}</span>
                                            <span className="text-muted-foreground">{tool.usage}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div className={`h-full ${tool.color} rounded-full`} style={{ width: `${tool.usage}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
