import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

// Check if Supabase is configured
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Flag to check if we're in demo mode
/**
 * Verifica si la aplicación se está ejecutando en modo "Demo" basándose en la configuración
 * de las variables de entorno de Supabase.
 * @returns true si falta configuración, de lo contrario false.
 */
export const getIsDemoMode = () => {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    return !SUPABASE_URL || !SUPABASE_ANON_KEY ||
        SUPABASE_URL === 'https://your-project.supabase.co' ||
        SUPABASE_URL === ''
}

// Mock Supabase client for demo mode
const createMockClient = () => {
    const mockQuery = () => ({
        select: (...args: any[]) => mockQuery(),
        insert: (...args: any[]) => mockQuery(),
        update: (...args: any[]) => mockQuery(),
        delete: (...args: any[]) => mockQuery(),
        eq: (...args: any[]) => mockQuery(),
        neq: (...args: any[]) => mockQuery(),
        gte: (...args: any[]) => mockQuery(),
        lte: (...args: any[]) => mockQuery(),
        or: (...args: any[]) => mockQuery(),
        in: (...args: any[]) => mockQuery(),
        order: (...args: any[]) => mockQuery(),
        limit: (...args: any[]) => mockQuery(),
        single: () => Promise.resolve({ data: null, error: { message: 'Demo mode - no database connected' } }),
        then: (resolve: (value: { data: null; error: null }) => void) => resolve({ data: null, error: null })
    })

    return {
        from: (table: string) => mockQuery(),
        channel: () => ({
            on: () => ({ subscribe: () => ({ unsubscribe: () => { } }) }),
            subscribe: () => ({ unsubscribe: () => { } })
        }),
        removeChannel: () => { },
        auth: {
            getUser: () => Promise.resolve({ data: { user: null }, error: null }),
            signIn: () => Promise.resolve({ data: null, error: null }),
            signOut: () => Promise.resolve({ error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } })
        }
    }
}

/**
 * Crea y devuelve un cliente de Supabase para su uso en el navegador (cliente).
 * Si la app está en modo demo, devuelve un cliente mockeado para prevenir errores.
 * @returns Cliente de Supabase tipado.
 */
export function createClient(): ReturnType<typeof createBrowserClient<Database>> {
    if (getIsDemoMode()) {
        console.log('🎭 BarberCloud running in DEMO MODE - No Supabase configured')
        return createMockClient() as unknown as ReturnType<typeof createBrowserClient<Database>>
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    return createBrowserClient<Database>(
        SUPABASE_URL!,
        SUPABASE_ANON_KEY!
    )
}

/**
 * Crea un cliente de Supabase específico para ambientes de servidor o API routes.
 * Utiliza URL y Key explícitas (útil si hay configuraciones multi-tenant por ejemplo).
 * @param supabaseUrl URL del proyecto Supabase.
 * @param supabaseKey Clave o token de Supabase.
 * @returns Cliente de Supabase.
 */
export function createServerClient(supabaseUrl: string, supabaseKey: string) {
    if (getIsDemoMode()) {
        return createMockClient() as unknown as ReturnType<typeof createBrowserClient<Database>>
    }
    return createBrowserClient<Database>(supabaseUrl, supabaseKey)
}

// Helper to safely format Supabase errors and avoid Next.js overlay crashes with empty objects
/**
 * Formatea errores provenientes de Supabase para evitar que rompan la interfaz de usuario con objetos vacíos 
 * o páginas HTML de error completo.
 * @param err El objeto de error capturado.
 * @returns Mensaje de error formateado como string.
 */
export function formatError(err: any): string {
    if (!err) return 'Unknown error'
    const msg = err.message || err.toString()
    if (msg.includes('<!DOCTYPE html>') || msg.includes('521')) {
        return 'Connection Error: Database server is down or paused'
    }
    return typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err)
}
