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

export const metadata: Metadata = {
    title: 'BarberCloud AI',
    description: 'Sistema inteligente de gestión de citas para barberías',
    keywords: ['barbería', 'citas', 'gestión', 'IA', 'WhatsApp'],
    authors: [{ name: 'BarberCloud' }],
}

/**
 * Layout principal a nivel de raíz (Root Layout).
 * Configura el HTML estructurado, los metadatos SEO, e inyecta los proveedores globales
 * como el proveedor de Tema (creado para UI adaptativa) y el contexto de Autenticación.
 */
export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="es" className={inter.variable} suppressHydrationWarning>
            <body suppressHydrationWarning className={`${inter.variable} antialiased bg-background text-foreground transition-colors`}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="light"
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
