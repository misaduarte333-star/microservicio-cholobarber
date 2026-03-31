export interface TimeValidatorInput {
    hora_actual: string // Formato HH:mm (24h)
    hora_solicitada: string // String flexible (Ej: "3", "3pm", "15:00")
}

export interface TimeValidatorOutput {
    status: 'VALIDA' | 'RECHAZADA'
    motivo: 'ok' | 'pasada' | 'menos_15' | 'justo'
    advertencia: boolean
    hora_solicitada_24h: string
    siguiente_bloque: string | null
    siguiente_bloque_12h: string | null
}

export class TimeValidator {
    static validate(input: TimeValidatorInput): TimeValidatorOutput {
        const horaActualStr = input.hora_actual
        const horaSolicitadaStr = input.hora_solicitada

        const [hAct, mAct] = horaActualStr.split(':').map(Number)
        const actualMin = hAct * 60 + mAct

        const p = this.parseHora(horaSolicitadaStr)
        const r = this.redondear(p.h, p.m)
        const hF = r.h
        const mF = r.m

        const solicitadaMin = hF * 60 + mF
        const diff = solicitadaMin - actualMin

        let status: 'VALIDA' | 'RECHAZADA' = 'VALIDA'
        let motivo: 'ok' | 'pasada' | 'menos_15' | 'justo' = 'ok'
        let advertencia = false
        let siguiente: string | null = null

        if (diff < 0) {
            status = 'RECHAZADA'
            motivo = 'pasada'
        } else if (diff < 15) {
            status = 'RECHAZADA'
            motivo = 'menos_15'
        } else if (diff <= 30) {
            advertencia = true
            motivo = 'justo'
        }

        if (status === 'RECHAZADA') {
            let tempH = hF
            let tempM = mF
            for (let i = 0; i < 48; i++) {
                const next = this.siguienteBloque(tempH, tempM)
                const nextMin = next.h * 60 + next.m
                const d = nextMin - actualMin
                if (d >= 15) {
                    siguiente = this.formatHora24(next.h, next.m)
                    break
                }
                tempH = next.h
                tempM = next.m
            }
        }

        return {
            status,
            motivo,
            advertencia,
            hora_solicitada_24h: this.formatHora24(hF, mF),
            siguiente_bloque: siguiente,
            siguiente_bloque_12h: siguiente
                ? this.formatHora12(parseInt(siguiente.split(':')[0]), parseInt(siguiente.split(':')[1]))
                : null
        }
    }

    static parseHoraPublic(horaStr: string): { h: number; m: number } {
        return this.parseHora(horaStr)
    }

    static redondearPublic(h: number, m: number): { h: number; m: number } {
        return this.redondear(h, m)
    }

    private static parseHora(horaStr: string): { h: number; m: number } {
        let str = horaStr.toLowerCase().trim()
        const pm = str.includes('pm')
        const am = str.includes('am')

        // Limpiar de texto AM/PM y caracteres no numéricos excepto :
        str = str.replace(/[pam.\s]/g, '')

        const parts = str.split(':')
        let h = parseInt(parts[0], 10)
        let m = parts[1] ? parseInt(parts[1], 10) : 0

        if (pm && h < 12) h += 12
        if (am && h === 12) h = 0

        // Heurística de negocio: 1-10 sin am/pm se asumen PM (horario de barbería).
        if (!pm && !am) {
            if (h >= 1 && h <= 10) h += 12
        }

        if (h > 23) h = 0

        return { h, m }
    }

    private static redondear(h: number, m: number): { h: number; m: number } {
        if (m === 0 || m === 30) return { h, m }
        if (m < 30) return { h, m: 30 }
        return { h: h + 1, m: 0 }
    }

    private static siguienteBloque(h: number, m: number): { h: number; m: number } {
        if (m === 0) return { h, m: 30 }
        return { h: h + 1 > 23 ? 0 : h + 1, m: 0 }
    }

    private static formatHora12(h: number, m: number): string {
        const periodo = h >= 12 ? 'PM' : 'AM'
        const h12 = h % 12 === 0 ? 12 : h % 12
        return `${h12}:${m.toString().padStart(2, '0')} ${periodo}`
    }

    private static formatHora24(h: number, m: number): string {
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    }
}
