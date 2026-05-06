import { NextResponse } from 'next/server'

export interface AuthResult {
    authenticated: boolean
    role?: 'dev' | 'admin' | 'barbero'
    response?: NextResponse
}

/**
 * Verifica autenticación para una API route.
 * Debe usarse DENTRO de cada route handler como defensa adicional al middleware.
 *
 * Uso:
 *   const auth = await verifyApiAuth(req)
 *   if (!auth.authenticated) return auth.response!
 */
export async function verifyApiAuth(request: Request): Promise<AuthResult> {
    const dashboardToken = process.env.DASHBOARD_TOKEN
    const authHeader = request.headers.get('authorization')

    if (dashboardToken && authHeader) {
        if (authHeader === `Bearer ${dashboardToken}`) {
            return { authenticated: true, role: 'dev' }
        }
    }

    // Parse cookies from the request header
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
        const cookies = parseCookies(cookieHeader)
        const sessionCookie = cookies.get('session')
        if (sessionCookie) {
            try {
                const session = JSON.parse(sessionCookie)
                if (session && (session.role === 'dev' || session.role === 'admin' || session.role === 'barbero')) {
                    return { authenticated: true, role: session.role }
                }
            } catch {
                // Cookie inválida
            }
        }
    }

    return {
        authenticated: false,
        response: NextResponse.json(
            { error: 'No autorizado. Se requiere autenticación.' },
            { status: 401 }
        ),
    }
}

/**
 * Verifica que el rol sea específicamente 'dev'.
 */
export async function requireDevAuth(request: Request): Promise<AuthResult> {
    const result = await verifyApiAuth(request)
    if (!result.authenticated) return result
    if (result.role !== 'dev') {
        return {
            authenticated: false,
            response: NextResponse.json(
                { error: 'Acceso denegado. Se requieren credenciales de desarrollador.' },
                { status: 403 }
            ),
        }
    }
    return result
}

/**
 * Verifica que el rol sea 'admin' o 'dev'.
 */
export async function requireAdminAuth(request: Request): Promise<AuthResult> {
    const result = await verifyApiAuth(request)
    if (!result.authenticated) return result
    if (result.role !== 'admin' && result.role !== 'dev') {
        return {
            authenticated: false,
            response: NextResponse.json(
                { error: 'Acceso denegado. Se requieren credenciales de administrador.' },
                { status: 403 }
            ),
        }
    }
    return result
}

function parseCookies(cookieHeader: string): Map<string, string> {
    const cookies = new Map<string, string>()
    cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.split('=')
        if (name && rest.length) {
            cookies.set(name.trim(), decodeURIComponent(rest.join('=')))
        }
    })
    return cookies
}
