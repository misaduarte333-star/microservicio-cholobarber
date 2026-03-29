'use client'

/**
 * Propiedades esperadas por el componente KPICard
 */
interface KPICardProps {
    titulo: string
    valor: number | string
    color: 'purple' | 'green' | 'blue' | 'red' | 'amber'
    icon: 'calendar' | 'check' | 'money' | 'x' | 'users'
    trend?: number
    trendInverse?: boolean
}

/**
 * Componente tipo Tarjeta (Card) utilizado en los dashboards para mostrar un 
 * Indicador Clave de Rendimiento (KPI) con un ícono, título y color determinado.
 * Puede mostrar tendencias porcentuales si se proveen.
 */
export function KPICard({ titulo, valor, color, icon, trend, trendInverse }: KPICardProps) {
    const colorConfig = {
        purple: {
            bg: 'bg-gradient-to-br from-purple-600/20 to-purple-700/10',
            border: 'border-purple-500/20',
            icon: 'text-purple-400',
            iconBg: 'bg-purple-500/20'
        },
        green: {
            bg: 'bg-gradient-to-br from-emerald-600/20 to-emerald-700/10',
            border: 'border-emerald-500/20',
            icon: 'text-emerald-400',
            iconBg: 'bg-emerald-500/20'
        },
        blue: {
            bg: 'bg-gradient-to-br from-blue-600/20 to-blue-700/10',
            border: 'border-blue-500/20',
            icon: 'text-blue-400',
            iconBg: 'bg-blue-500/20'
        },
        red: {
            bg: 'bg-gradient-to-br from-red-600/20 to-red-700/10',
            border: 'border-red-500/20',
            icon: 'text-red-400',
            iconBg: 'bg-red-500/20'
        },
        amber: {
            bg: 'bg-gradient-to-br from-amber-600/20 to-amber-700/10',
            border: 'border-amber-500/20',
            icon: 'text-amber-400',
            iconBg: 'bg-amber-500/20'
        }
    }

    const config = colorConfig[color]

    const getIcon = () => {
        switch (icon) {
            case 'calendar':
                return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            case 'check':
                return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            case 'money':
                return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            case 'x':
                return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            case 'users':
                return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            default:
                return null
        }
    }

    // Determine if trend is positive based on trendInverse
    const isPositive = trendInverse ? (trend || 0) < 0 : (trend || 0) > 0

    return (
        <div className={`
      rounded-2xl p-6 border backdrop-blur-sm
      ${config.bg} ${config.border}
      transition-all duration-300 hover:scale-[1.02]
      shadow-sm hover:shadow-md
    `}>
            <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl ${config.iconBg} flex items-center justify-center`}>
                    <svg className={`w-6 h-6 ${config.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {getIcon()}
                    </svg>
                </div>

                {trend !== undefined && (
                    <div className={`
            flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full
            ${isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}
          `}>
                        <svg
                            className={`w-3 h-3 ${isPositive ? '' : 'rotate-180'}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                        {Math.abs(trend).toFixed(2)}%
                    </div>
                )}
            </div>

            <p className="text-muted-foreground text-sm mb-1">{titulo}</p>
            <p className="text-3xl font-bold text-foreground">{valor}</p>
        </div>
    )
}
