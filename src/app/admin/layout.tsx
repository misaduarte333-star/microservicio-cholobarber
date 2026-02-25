'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isMounted, setIsMounted] = useState(false) // Fix hydration mismatch
    const active = pathname.split('/').pop() || 'admin'

    useEffect(() => {
        setIsMounted(true)
    }, [])

    // Helper for active state
    const isActive = (key: string) => {
        if (key === 'dashboard') return pathname === '/admin'
        return pathname.startsWith(`/admin/${key}`)
    }

    if (!isMounted) {
        return <div className="min-h-screen bg-slate-900 flex" /> // Return empty shell to avoid mismatch
    }

    return (
        <div className="min-h-screen bg-slate-900 flex transition-all duration-300">
            {/* Sidebar */}
            <aside 
                className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-800/50 backdrop-blur-xl border-r border-slate-700/50 flex-shrink-0 fixed h-full z-50 transition-all duration-300`}
            >
                <div className="p-4 h-full flex flex-col relative">
                    {/* Toggle Button */}
                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="absolute -right-3 top-9 bg-slate-700 text-slate-300 rounded-full p-1 border border-slate-600 hover:bg-slate-600 hover:text-white transition-colors"
                        title={isCollapsed ? "Expandir" : "Contraer"}
                    >
                        <svg className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>

                    {/* Logo */}
                    <Link href="/admin" className={`flex items-center gap-3 mb-10 text-white hover:opacity-80 transition-opacity ${isCollapsed ? 'justify-center' : ''}`}>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-purple-400 flex items-center justify-center shadow-lg shadow-purple-900/20 flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div className={`transition-all duration-300 overflow-hidden ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                            <h1 className="font-bold text-lg leading-none whitespace-nowrap">BarberCloud</h1>
                            <p className="text-xs text-slate-400 mt-1 whitespace-nowrap">Panel Admin</p>
                        </div>
                    </Link>

                    {/* Navigation */}
                    <nav className="space-y-1 flex-1">
                        <NavItem href="/admin" icon="dashboard" label="Dashboard" active={isActive('dashboard')} collapsed={isCollapsed} />
                        <NavItem href="/admin/citas" icon="calendar" label="Citas" active={isActive('citas')} collapsed={isCollapsed} />
                        <NavItem href="/admin/barberos" icon="users" label="Barberos" active={isActive('barberos')} collapsed={isCollapsed} />
                        <NavItem href="/admin/servicios" icon="scissors" label="Servicios" active={isActive('servicios')} collapsed={isCollapsed} />
                        <NavItem href="/admin/reportes" icon="chart" label="Reportes" active={isActive('reportes')} collapsed={isCollapsed} />
                        <NavItem href="/admin/configuracion" icon="settings" label="Configuración" active={isActive('configuracion')} collapsed={isCollapsed} />
                    </nav>

                    {/* User Profile */}
                    <div className="pt-6 border-t border-slate-700/50">
                        <div className={`glass-card p-3 flex items-center gap-3 bg-slate-800/80 ${isCollapsed ? 'justify-center' : ''}`}>
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-amber-400 flex items-center justify-center text-sm font-bold text-white shadow-lg flex-shrink-0">
                                A
                            </div>
                            <div className={`flex-1 min-w-0 transition-all duration-300 overflow-hidden ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
                                <p className="text-sm font-medium text-white truncate">Admin</p>
                                <p className="text-xs text-slate-400 truncate">Sucursal Principal</p>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className={`flex-1 ${isCollapsed ? 'ml-20' : 'ml-64'} p-8 min-h-screen transition-all duration-300`}>
                <div className="max-w-7xl mx-auto animate-fade-in">
                    {children}
                </div>
            </main>
        </div>
    )
}

function NavItem({ href, icon, label, active = false, collapsed = false }: { href: string; icon: string; label: string; active?: boolean; collapsed?: boolean }) {
    const getIcon = () => {
        switch (icon) {
            case 'dashboard': return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            case 'calendar': return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            case 'users': return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            case 'scissors': return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
            case 'chart': return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            case 'settings': return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.31 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            default: return null
        }
    }

    return (
        <Link
            href={href}
            className={`
        flex items-center ${collapsed ? 'justify-center gap-0 px-2' : 'gap-3 px-4'} py-3 rounded-xl transition-all duration-200 group
        ${active
                    ? 'bg-purple-600 shadow-md shadow-purple-900/40 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }
      `}
            title={collapsed ? label : undefined}
        >
            <svg className={`w-5 h-5 transition-transform group-hover:scale-110 flex-shrink-0 ${active ? 'text-white' : 'text-current'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {getIcon()}
            </svg>
            <span className={`font-medium transition-all duration-300 overflow-hidden whitespace-nowrap ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                {label}
            </span>
            {active && !collapsed && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white opacity-50 flex-shrink-0" />
            )}
        </Link>
    )
}
