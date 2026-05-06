import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Rutas que siempre son públicas (no requieren auth).
 */
const PUBLIC_ROUTES = [
    '/api/auth/login',
    '/api/auth/reset-password',
    '/api/webhook/evolution',
    '/api/webhook/cache',
    '/api/cron/reminders',
    '/api/costos-fijos',
    '/api/admin/health',
]

/**
 * Verifica el token de autorización contra las credenciales de dev/admin.
 * Soporta dos mecanismos:
 * 1. Header Authorization: Bearer <DASHBOARD_TOKEN>
 * 2. Cookie de sesión (si el frontend la envía)
 */
function verifyAuth(request: NextRequest): { authenticated: boolean; role?: string } {
    const dashboardToken = process.env.DASHBOARD_TOKEN
    const authHeader = request.headers.get('authorization')

    // Si hay DASHBOARD_TOKEN configurado, verificar Bearer token
    if (dashboardToken && authHeader) {
        if (authHeader === `Bearer ${dashboardToken}`) {
            return { authenticated: true, role: 'dev' }
        }
    }

    // Si no hay Bearer token válido, verificar cookie de sesión
    const sessionCookie = request.cookies.get('session')
    if (sessionCookie) {
        try {
            const session = JSON.parse(sessionCookie.value)
            if (session && (session.role === 'dev' || session.role === 'admin' || session.role === 'barbero')) {
                return { authenticated: true, role: session.role }
            }
        } catch {
            // Cookie inválida, ignorar
        }
    }

    return { authenticated: false }
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Rutas públicas no requieren auth
    if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
        return NextResponse.next()
    }

    // Verificar auth para rutas protegidas
    const { authenticated, role } = verifyAuth(request)

    if (!authenticated) {
        return NextResponse.json(
            { error: 'No autorizado. Se requiere autenticación.' },
            { status: 401 }
        )
    }

    // Restricción por rol
    if (pathname.startsWith('/api/dev/') && role !== 'dev') {
        return NextResponse.json(
            { error: 'Acceso denegado. Se requieren credenciales de desarrollador.' },
            { status: 403 }
        )
    }

    if (pathname.startsWith('/api/admin/') && role !== 'admin' && role !== 'dev') {
        return NextResponse.json(
            { error: 'Acceso denegado. Se requieren credenciales de administrador.' },
            { status: 403 }
        )
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        '/api/dev/:path*',
        '/api/admin/:path*',
        '/api/auth/reset-password',
        '/api/costos-fijos/:path*',
    ],
}
