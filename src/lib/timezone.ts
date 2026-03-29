/**
 * Zona horaria por defecto para la aplicación.
 * Hermosillo, Sonora - UTC-7 sin horario de verano.
 */
export const APP_TIMEZONE = 'America/Hermosillo'

/**
 * Obtiene la fecha actual en la zona horaria de la app como string YYYY-MM-DD.
 */
export function todayInTZ(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
}

/**
 * Obtiene el inicio del día (00:00:00) en la zona horaria de la app como ISO string.
 */
export function startOfDayISO(dateStr?: string): string {
    const fecha = dateStr || todayInTZ()
    return new Date(`${fecha}T00:00:00-07:00`).toISOString()
}

/**
 * Obtiene el fin del día (23:59:59) en la zona horaria de la app como ISO string.
 */
export function endOfDayISO(dateStr?: string): string {
    const fecha = dateStr || todayInTZ()
    return new Date(`${fecha}T23:59:59-07:00`).toISOString()
}

/**
 * Formatea una hora desde un timestamp ISO a formato HH:MM en la zona de la app.
 */
export function formatTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: APP_TIMEZONE
    })
}

/**
 * Formatea una fecha desde un timestamp ISO en la zona de la app.
 */
export function formatDate(isoString: string, options?: Intl.DateTimeFormatOptions): string {
    return new Date(isoString).toLocaleDateString('es-MX', {
        timeZone: APP_TIMEZONE,
        ...options
    })
}

/**
 * Obtiene la hora actual formateada HH:MM en la zona de la app.
 */
export function currentTimeFormatted(): string {
    return new Date().toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: APP_TIMEZONE
    })
}
