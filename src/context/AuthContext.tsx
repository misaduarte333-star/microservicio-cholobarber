'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

type AppRole = 'dev' | 'admin' | 'barbero' | null

interface AuthContextType {
    user: User | null
    loading: boolean
    sucursalId: string
    sucursalNombre: string
    isAdmin: boolean
    role: AppRole
    sessionUser: any | null
    logout: () => void
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    sucursalId: '',
    sucursalNombre: '',
    isAdmin: false,
    role: null,
    sessionUser: null,
    logout: () => {},
})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)
    const [role, setRole] = useState<AppRole>(null)
    const [sessionUser, setSessionUser] = useState<any>(null)
    
    // Default fallback values if session is missing
    const [sucursalId, setSucursalId] = useState<string>('')
    const [sucursalNombre, setSucursalNombre] = useState<string>('')

    const supabase = createClient()

    const logout = useCallback(() => {
        sessionStorage.removeItem('barbercloud_session')
        sessionStorage.removeItem('barbero_session')
        setRole(null)
        setSessionUser(null)
        setIsAdmin(false)
        window.location.href = '/'
    }, [])

    useEffect(() => {
        // Migrate: clean up old localStorage sessions (now using sessionStorage per-tab)
        localStorage.removeItem('barbercloud_session')
        localStorage.removeItem('barbero_session')

        const checkSession = async () => {
            try {
                // Check local session first
                const raw = sessionStorage.getItem('barbercloud_session')
                let localSucursalId = ''
                if (raw) {
                    const session = JSON.parse(raw)
                    setRole(session.role)
                    setSessionUser(session.user)
                    
                    if (session.user?.sucursal_id) {
                        localSucursalId = session.user.sucursal_id
                        setSucursalId(session.user.sucursal_id)
                    } else if (session.user?.negocio_id) {
                        localSucursalId = session.user.negocio_id
                        setSucursalId(session.user.negocio_id) // Fallback for old sessions before migration
                    }
                    if (session.role === 'admin') setIsAdmin(true)
                }

                // Also check Supabase auth (for backward compat)
                const { data: { user } } = await supabase.auth.getUser()
                setUser(user)

                let finalSucursalId = localSucursalId

                if (user && user.email) {
                    const { data } = await (supabase
                        .from('usuarios_admin')
                        .select('rol, sucursal_id')
                        .eq('email', user.email)
                        .single() as any)

                    if (data) {
                        setIsAdmin(true)
                        if (data.sucursal_id && !localSucursalId) {
                            finalSucursalId = data.sucursal_id
                            setSucursalId(data.sucursal_id)
                        }
                    } else if (user.email === 'dev@barbercloud.com') {
                        // Dev user fallback if not in usuarios_admin
                        setIsAdmin(true)
                        setRole('admin')
                    }
                }

                // If still no sucursalId and we are admin/dev, fetch the first one as default
                // Use sessionUser.email since we use custom login (not Supabase Auth directly)
                const currentEmail = user?.email || sessionUser?.email
                
                if (!finalSucursalId && (currentEmail === 'dev@barbercloud.com' || role === 'dev' || isAdmin || role === 'admin')) {
                    const { data: firstSuc } = await (supabase
                        .from('sucursales')
                        .select('id')
                        .limit(1)
                        .single() as any)
                    
                    if (firstSuc) {
                        finalSucursalId = firstSuc.id
                        setSucursalId(firstSuc.id)
                    }
                }

                // Fetch sucursal name once we have the ID
                if (finalSucursalId) {
                    const { data: sucData } = await (supabase
                        .from('sucursales')
                        .select('nombre')
                        .eq('id', finalSucursalId)
                        .single() as any)
                    
                    if (sucData) {
                        setSucursalNombre(sucData.nombre)
                    }
                }
            } catch (error) {
                console.error('Auth check error:', error)
            } finally {
                setLoading(false)
            }
        }

        checkSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [supabase])

    return (
        <AuthContext.Provider value={{ user, loading, sucursalId, sucursalNombre, isAdmin, role, sessionUser, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)
