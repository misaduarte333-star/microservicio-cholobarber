'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient, formatError } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useAuth } from '@/context/AuthContext'
import type { Servicio, CostoFijo } from '@/lib/types'
import { APP_TIMEZONE, todayInTZ, startOfDayISO } from '@/lib/timezone'
import Link from 'next/link'

export default function PuntoEquilibrioPage() {
    const { sucursalId } = useAuth()
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [mes, setMes] = useState(todayInTZ().slice(0, 7)) // YYYY-MM
    const [activeTab, setActiveTab] = useState<'costos-fijos' | 'mix-ventas' | 'resultados'>('costos-fijos')

    // Data State
    const [costosFijos, setCostosFijos] = useState<CostoFijo[]>([])
    const [servicios, setServicios] = useState<Servicio[]>([])
    const [citasDelMes, setCitasDelMes] = useState<any[]>([])

    // Load Initial Data
    useEffect(() => {
        if (!sucursalId) return
        // We already have sucursalId from AuthContext, just let charging trigger
    }, [sucursalId])

    const cargarDatos = useCallback(async () => {
        if (!sucursalId) return
        setLoading(true)
        try {
            // Fetch Costos Fijos
            const resCostos = await fetch(`/api/costos-fijos?sucursal_id=${sucursalId}&mes=${mes}`)
            const dataCostos = await resCostos.json()
            if (!resCostos.ok) throw new Error(dataCostos.error)
            setCostosFijos(dataCostos)

            // Fetch Servicios
            const { data: servs, error: errorServs } = await supabase.from('servicios').select('*').eq('sucursal_id', sucursalId)
            if (errorServs) throw errorServs
            setServicios(servs || [])

            // Fetch Citas for Mix
            const startDate = startOfDayISO(`${mes}-01`)
            const nextMonth = new Date(`${mes}-01T12:00:00-07:00`)
            nextMonth.setMonth(nextMonth.getMonth() + 1)
            const endDate = startOfDayISO(nextMonth.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE }))
            const { data: citasData, error: errorCitas } = await (supabase.from('citas') as any)
                .select('servicio_id, estado, servicios(precio, costo_directo)')
                .eq('sucursal_id', sucursalId)
                .gte('timestamp_inicio', startDate)
                .lt('timestamp_inicio', endDate)
                .in('estado', ['finalizada', 'confirmada']) // Incluimos confirmadas si queremos predecir, o solo finalizadas.

            if (errorCitas) throw errorCitas
            setCitasDelMes(citasData || [])

        } catch (err) {
            console.error('Error cargando PDE:', formatError(err))
        } finally {
            setLoading(false)
        }
    }, [supabase, sucursalId, mes])

    useEffect(() => {
        cargarDatos()
    }, [cargarDatos])

    // ==========================================
    // CALCULATIONS
    // ==========================================
    const totalCostosFijos = costosFijos.reduce((sum, c) => sum + Number(c.monto), 0)

    // Calculate Mix
    const validCitas = citasDelMes.filter(c => c.servicio_id)
    const totalCitasCount = validCitas.length || 1 // Avoid division by zero
    
    const mixByService = servicios.map(srv => {
        const qty = validCitas.filter(c => c.servicio_id === srv.id).length
        const mixPercent = qty / totalCitasCount
        const mc = srv.precio - (srv.costo_directo || 0)
        return {
            ...srv,
            qty_real: qty,
            mix_percent: mixPercent,
            mc,
            mc_ponderado: mc * mixPercent,
            precio_ponderado: srv.precio * mixPercent,
            cv_ponderado: (srv.costo_directo || 0) * mixPercent
        }
    })

    const mcPonderadoTotal = mixByService.reduce((sum, item) => sum + item.mc_ponderado, 0)
    const precioPonderadoTotal = mixByService.reduce((sum, item) => sum + item.precio_ponderado, 0)
    const cvPonderadoTotal = mixByService.reduce((sum, item) => sum + item.cv_ponderado, 0)

    const pdeUnidades = mcPonderadoTotal > 0 ? Math.ceil(totalCostosFijos / mcPonderadoTotal) : 0
    const pdePesos = pdeUnidades * precioPonderadoTotal

    const ingresosReales = mixByService.reduce((sum, item) => sum + (item.qty_real * item.precio), 0)
    const percentLogro = pdePesos > 0 ? (ingresosReales / pdePesos) * 100 : 0
    const utilidadBruta = ingresosReales - totalCostosFijos - mixByService.reduce((sum, item) => sum + (item.qty_real * (item.costo_directo || 0)), 0)

    // ==========================================
    // CHART DATA
    // ==========================================
    const chartData = []
    const step = Math.max(1, Math.ceil(pdeUnidades * 2 / 20)) // 20 points
    for (let u = 0; u <= (pdeUnidades * 2 || 100); u += step) {
        chartData.push({
            unidades: u,
            ingresos: u * precioPonderadoTotal,
            costosTotales: totalCostosFijos + (u * cvPonderadoTotal),
            costosFijos: totalCostosFijos,
            costosVariables: u * cvPonderadoTotal
        })
    }

    // ==========================================
    // HANDLERS (Costos Fijos)
    // ==========================================
    const handleSaveCostos = async (nuevosCostos: CostoFijo[]) => {
        try {
            const res = await fetch('/api/costos-fijos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sucursal_id: sucursalId,
                    mes,
                    costos: nuevosCostos
                })
            })
            if (!res.ok) throw new Error('Error guardando')
            cargarDatos()
        } catch (err) {
            alert('Error al guardar costos fijos')
        }
    }

    return (
        <div className="max-w-7xl mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Link href="/admin/reportes" className="text-muted-foreground hover:text-foreground transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                        </Link>
                        <h1 className="text-3xl font-bold text-foreground">Punto de Equilibrio</h1>
                    </div>
                    <p className="text-muted-foreground">Análisis financiero de costos y ventas</p>
                </div>
                <div className="glass-card p-2 flex items-center gap-2">
                    <svg className="w-5 h-5 text-muted-foreground ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <input
                        type="month"
                        value={mes}
                        onChange={(e) => setMes(e.target.value)}
                        className="bg-transparent border-none text-foreground focus:ring-0 outline-none w-32 font-medium"
                    />
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex space-x-2 mb-8 bg-surface/ p-1 rounded-xl w-fit">
                {(['costos-fijos', 'mix-ventas', 'resultados'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 capitalize ${activeTab === tab ? 'bg-purple-600 text-foreground shadow-lg' : 'text-muted-foreground hover:text-foreground hover:bg-surface-hover/'}`}
                    >
                        {tab.replace('-', ' ')}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="glass-card p-12 flex justify-center items-center">
                    <div className="spinner w-8 h-8"></div>
                </div>
            ) : (
                <>
                    {/* COSTOS FIJOS TAB */}
                    {activeTab === 'costos-fijos' && (
                        <TabCostosFijos costos={costosFijos} onSave={handleSaveCostos} />
                    )}

                    {/* MIX DE VENTAS TAB */}
                    {activeTab === 'mix-ventas' && (
                        <div className="glass-card p-6 animate-fade-in">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-foreground">Desglose de PDE por Servicio</h2>
                                <p className="text-sm text-muted-foreground">Basado en las citas del mes: {validCitas.length} en total</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                            <th className="p-4">Servicio</th>
                                            <th className="p-4">Costo Dir.</th>
                                            <th className="p-4">Mix %</th>
                                            <th className="p-4">PDE (Unidades)</th>
                                            <th className="p-4">PDE (Pesos)</th>
                                            <th className="p-4">Vendidas Real</th>
                                            <th className="p-4">Diferencia</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/50">
                                        {mixByService.map(item => {
                                            const itemPdeU = Math.ceil(pdeUnidades * item.mix_percent)
                                            const itemPdeP = itemPdeU * item.precio
                                            const diff = item.qty_real - itemPdeU
                                            const isPos = diff >= 0
                                            return (
                                                <tr key={item.id} className="hover:bg-surface/ transition-colors">
                                                    <td className="p-4 font-medium text-foreground">{item.nombre}</td>
                                                    <td className="p-4 text-muted">${item.costo_directo?.toLocaleString() || '0'}</td>
                                                    <td className="p-4 text-muted">{(item.mix_percent * 100).toFixed(1)}%</td>
                                                    <td className="p-4 text-amber-400 font-medium">{itemPdeU} u</td>
                                                    <td className="p-4 text-muted">${itemPdeP.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                                    <td className="p-4 text-foreground font-medium">{item.qty_real} u</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${isPos ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                            {isPos ? '+' : ''}{diff} {isPos ? '✓' : 'x'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4 p-4 bg-surface/ rounded-lg flex items-center justify-between">
                                <span className="text-muted-foreground text-sm">¿Faltan costos directos?</span>
                                <Link href="/admin/servicios" className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors">
                                    Configurar en Servicios →
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* RESULTADOS TAB */}
                    {activeTab === 'resultados' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="glass-card p-6">
                                    <h3 className="text-muted-foreground text-sm font-medium mb-1 line-clamp-1">PDE en Pesos</h3>
                                    <div className="text-3xl font-bold text-foreground mb-1">${pdePesos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                                    <div className="text-xs text-muted-foreground/70">MC Ponderado: {(mcPonderadoTotal / (precioPonderadoTotal || 1) * 100).toFixed(2)}%</div>
                                </div>
                                <div className="glass-card p-6">
                                    <h3 className="text-muted-foreground text-sm font-medium mb-1">PDE en Unidades</h3>
                                    <div className="text-3xl font-bold text-foreground mb-1">{pdeUnidades}</div>
                                    <div className="text-xs text-muted-foreground/70">Vendidas: {validCitas.length} u. (${ingresosReales.toLocaleString()})</div>
                                </div>
                                <div className="glass-card p-6">
                                    <h3 className="text-muted-foreground text-sm font-medium mb-1">% de Logro</h3>
                                    <div className={`text-3xl font-bold mb-1 ${percentLogro >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {percentLogro.toFixed(1)}%
                                    </div>
                                    <div className="text-xs text-muted-foreground/70">Respecto a la meta mensual</div>
                                </div>
                                <div className="glass-card p-6">
                                    <h3 className="text-muted-foreground text-sm font-medium mb-1">Utilidad Bruta</h3>
                                    <div className={`text-3xl font-bold mb-1 ${utilidadBruta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        ${utilidadBruta.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-xs text-muted-foreground/70">Costos fijos totales: ${totalCostosFijos.toLocaleString()}</div>
                                </div>
                            </div>

                            <div className="glass-card p-6">
                                <h2 className="text-xl font-bold text-foreground mb-6">Gráfica de Punto de Equilibrio</h2>
                                <div className="h-96 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                            <XAxis 
                                                dataKey="unidades" 
                                                stroke="#94a3b8" 
                                                tick={{ fill: '#94a3b8' }}
                                                label={{ value: 'Unidades Vendidas', position: 'insideBottom', offset: -10, fill: '#94a3b8' }}
                                            />
                                            <YAxis 
                                                stroke="#94a3b8" 
                                                tick={{ fill: '#94a3b8' }} 
                                                tickFormatter={(value) => `$${value >= 1000 ? (value / 1000) + 'k' : value}`}
                                            />
                                            <RechartsTooltip 
                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff', borderRadius: '8px' }}
                                                itemStyle={{ color: '#fff' }}
                                                formatter={(value, name) => [
                                                    `$${Number(value).toLocaleString()}`, 
                                                    name === 'ingresos' ? 'Ingresos' : 
                                                    name === 'costosTotales' ? 'Costos Totales' : 
                                                    name === 'costosFijos' ? 'Costos Fijos' : 
                                                    'Costos Variables'
                                                ]}
                                                labelFormatter={(label) => `${label} Unidades`}
                                            />
                                            <ReferenceLine x={pdeUnidades} stroke="#8b5cf6" strokeDasharray="3 3" label={{ value: 'PDE', position: 'top', fill: '#8b5cf6' }} />
                                            
                                            {/* Costos Fijos */}
                                            <Line type="monotone" dataKey="costosFijos" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" name="costosFijos" />
                                            {/* Costos Variables */}
                                            <Line type="monotone" dataKey="costosVariables" stroke="#3b82f6" strokeWidth={2} dot={false} name="costosVariables" />
                                            {/* Costos Totales */}
                                            <Line type="monotone" dataKey="costosTotales" stroke="#ef4444" strokeWidth={2} dot={false} name="costosTotales" />
                                            {/* Ingresos */}
                                            <Line type="monotone" dataKey="ingresos" stroke="#10b981" strokeWidth={2} dot={false} name="ingresos" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex justify-center gap-6 mt-4">
                                    <div className="flex items-center gap-2 text-sm text-muted"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Ingresos</div>
                                    <div className="flex items-center gap-2 text-sm text-muted"><div className="w-3 h-3 rounded-full bg-red-500"></div> Costos Totales</div>
                                    <div className="flex items-center gap-2 text-sm text-muted"><div className="w-3 h-3 rounded-full border-2 border-dashed border-red-500"></div> Costos Fijos</div>
                                    <div className="flex items-center gap-2 text-sm text-muted"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Costos Variables</div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// ==========================================
// SUBCOMPONENTS
// ==========================================

function TabCostosFijos({ costos, onSave }: { costos: CostoFijo[], onSave: (data: any) => void }) {
    const defaultCategories = ['Renta del local', 'Nómina cocina', 'Nómina servicio', 'Nómina administrativa', 'Servicios: Luz', 'Servicios: Gas', 'Servicios: Agua', 'Servicios: Internet/Teléfono']
    
    // Initialize state with fetched costs or defaults
    const [localCostos, setLocalCostos] = useState<{ id: string, categoria: string, monto: number }[]>([])

    useEffect(() => {
        if (costos.length > 0) {
            setLocalCostos(costos.map(c => ({ id: Math.random().toString(), categoria: c.categoria, monto: Number(c.monto) })))
        } else {
            setLocalCostos(defaultCategories.map(c => ({ id: Math.random().toString(), categoria: c, monto: 0 })))
        }
    }, [costos])

    const handleActualizarMonto = (id: string, montoStr: string) => {
        const num = parseFloat(montoStr) || 0
        setLocalCostos(prev => prev.map(c => c.id === id ? { ...c, monto: num } : c))
    }

    const localTotal = localCostos.reduce((sum, c) => sum + c.monto, 0)

    const handleGuardar = () => {
        const valid = localCostos.filter(c => c.categoria.trim() !== '')
        onSave(valid.map(c => ({ categoria: c.categoria, monto: c.monto })))
    }

    const handleDelete = (id: string) => {
        setLocalCostos(prev => prev.filter(c => c.id !== id))
    }

    const handleAdd = () => {
        setLocalCostos([...localCostos, { id: Math.random().toString(), categoria: 'Nuevo Gasto', monto: 0 }])
    }

    return (
        <div className="glass-card p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-foreground">Costos Fijos del Mes</h2>
                <div className="flex gap-2">
                    <button className="btn-secondary flex items-center gap-2 px-3 py-1.5 text-sm" onClick={handleAdd}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg> Agregar
                    </button>
                    <button className="btn-primary" onClick={handleGuardar}>Guardar Cambios</button>
                </div>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="p-4 w-1/2">Categoría</th>
                            <th className="p-4 w-1/4">Monto Mensual ($)</th>
                            <th className="p-4 w-1/4">% del Total</th>
                            <th className="p-4 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {localCostos.map(item => {
                            const pct = localTotal > 0 ? (item.monto / localTotal) * 100 : 0
                            return (
                                <tr key={item.id} className="hover:bg-surface/ transition-colors">
                                    <td className="p-4">
                                        <input 
                                            type="text" 
                                            value={item.categoria} 
                                            onChange={(e) => setLocalCostos(prev => prev.map(c => c.id === item.id ? { ...c, categoria: e.target.value } : c))}
                                            className="bg-transparent border-none text-foreground focus:ring-0 p-0 w-full"
                                        />
                                    </td>
                                    <td className="p-4">
                                        <input 
                                            type="number" 
                                            min="0"
                                            value={item.monto || ''} 
                                            onChange={(e) => handleActualizarMonto(item.id, e.target.value)}
                                            className="bg-surface border border-border rounded px-3 py-1 text-foreground w-full max-w-[150px] focus:outline-none focus:border-purple-500"
                                        />
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-muted w-12 text-right">{pct.toFixed(1)}%</span>
                                            <div className="w-24 h-1.5 bg-surface-hover rounded-full overflow-hidden">
                                                <div className="h-full bg-purple-500" style={{ width: `${pct}%` }}></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <button onClick={() => handleDelete(item.id)} className="text-muted-foreground/70 hover:text-red-400 transition-colors">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="bg-surface/">
                            <td className="p-4 font-bold text-foreground text-right">TOTAL COSTOS FIJOS:</td>
                            <td className="p-4 font-bold text-foreground text-xl">${localTotal.toLocaleString()}</td>
                            <td className="p-4"></td>
                            <td className="p-4"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}
