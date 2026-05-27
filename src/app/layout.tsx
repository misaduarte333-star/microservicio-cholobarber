import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/components/ThemeProvider'

const inter = Inter({
    variable: '--font-inter',
    subsets: ['latin'],
    display: 'swap',
})

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'BotDynamic - Gestión Inteligente',
    description: 'Sistema inteligente de gestión de citas y agente IA para barberías',
    keywords: ['barbería', 'citas', 'gestión', 'IA', 'WhatsApp'],
    authors: [{ name: 'BotDynamic' }],
}

/**
 * Layout principal a nivel de raíz (Root Layout).
 * Configura el HTML estructurado, los metadatos SEO, e inyecta los proveedores globales
 * como el proveedor de Tema (creado para UI adaptativa) y el contexto de Autenticación.
 *
 * IMPORTANTE — window.ENV:
 * El Dockerfile usa placeholders para NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
 * en build-time para no quemar secrets reales en la imagen. Esto hace que Next.js inlinee
 * el placeholder en el bundle del cliente. Para solucionarlo, este layout inyecta un <script>
 * con las variables reales desde el servidor en runtime. El helper `getEnv()` en supabase.ts
 * lee window.ENV en el cliente y process.env en el servidor.
 */
export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    // Estas variables se resuelven en el SERVIDOR en cada request (runtime),
    // no en build-time, por lo que siempre contienen los valores reales.
    // Usamos notación de corchetes y variables que no empiezan con NEXT_PUBLIC_ 
    // para evitar que Next.js las reemplace con placeholders estáticos en build-time.
    const runtimeEnv = {
        NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL || process.env['NEXT_PUBLIC_SUPABASE_URL'] || '',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_KEY || process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '',
        NEXT_PUBLIC_APP_URL: process.env.APP_URL || process.env['NEXT_PUBLIC_APP_URL'] || '',
    }

    return (
        <html lang="es" className={inter.variable} suppressHydrationWarning>
            <head>
                {/* Inyección de env vars en runtime para evitar inlining del Dockerfile placeholder */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `window.ENV = ${JSON.stringify(runtimeEnv)};`
                    }}
                />
            </head>
            <body suppressHydrationWarning className={`${inter.variable} antialiased bg-background text-foreground transition-colors`}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="dark"
                    enableSystem={false}
                >
                    <AuthProvider>
                        {children}
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    )
}
