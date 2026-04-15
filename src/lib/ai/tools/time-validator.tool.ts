export interface TimeValidatorInput {
    hora_actual: string // Formato HH:mm (24h)
    hora_solicitada: string // String flexible (Ej: "3", "3pm", "15:00")
}

export interface TimeValidatorOutput {
    status: 'VALIDA' | 'RECHAZADA'
    motivo: 'ok' | 'pasada' | 'menos_15' | 'justo' | 'fuera_de_horario'
    advertencia: boolean
    ajustada: boolean
    hora_solicitada_24h: string
    sugerencia_fecha: 'hoy' | 'mañana' | null
    siguiente_bloque: string | null
    siguiente_bloque_12h: string | null
}

export class TimeValidator {
    static readonly HORA_APERTURA = 9  // 9 AM
    static readonly HORA_CIERRE = 20   // 8 PM

    static validate(input: TimeValidatorInput, config?: { apertura: number, cierre: number }): TimeValidatorOutput {
        const horaApertura = config?.apertura ?? this.HORA_APERTURA
        const horaCierre = config?.cierre ?? this.HORA_CIERRE

        const horaActualStr = input.hora_actual
        const horaSolicitadaStr = input.hora_solicitada

        console.log('[TimeValidator] validate input:', { horaActualStr, horaSolicitadaStr, config })
        
        const [hAct, mAct] = horaActualStr.split(':').map(Number)
        const actualMin = hAct * 60 + mAct

        const p = this.parseHora(horaSolicitadaStr)
        const r = this.redondear(p.h, p.m)
        const hF = r.h
        const mF = r.m

        // Detectar si hubo ajuste (si la hora original parsed no era :00 o :30)
        const ajustada = (p.m !== 0 && p.m !== 30)

        const solicitadaMin = hF * 60 + mF
        
        console.log('[TimeValidator] parsed:', { h: p.h, m: p.m }, 'rounded:', { hF, mF }, 'actualMin:', actualMin, 'solicitadaMin:', solicitadaMin)

        let status: 'VALIDA' | 'RECHAZADA' = 'VALIDA'
        let motivo: 'ok' | 'pasada' | 'menos_15' | 'justo' | 'fuera_de_horario' = 'ok'
        let advertencia = false
        let siguiente: string | null = null
        let sugerencia_fecha: 'hoy' | 'mañana' = 'hoy'

        // 1. Verificar si la hora ya pasó hoy
        if (solicitadaMin < actualMin) {
            status = 'RECHAZADA'
            motivo = 'pasada'
        } 
        // 2. Verificar si está fuera de horario comercial
        else if (hF < horaApertura || hF >= horaCierre) {
            status = 'RECHAZADA'
            motivo = 'fuera_de_horario'
        }
        // 3. Regla de "faltan menos de 15 minutos" para hoy
        else if (solicitadaMin - actualMin < 15) {
            status = 'RECHAZADA'
            motivo = 'menos_15'
        } 
        // 4. Advertencia si faltan menos de 30 minutos
        else if (solicitadaMin - actualMin <= 30) {
            advertencia = true
            motivo = 'justo'
        }

        // Si es rechazada o advertencia, buscar sugerencia
        if (status === 'RECHAZADA' || motivo === 'justo') {
            console.log(`[TimeValidator] Finding suggestion for motivo: ${motivo}, hF: ${hF}, cierre: ${horaCierre}`)
            // Caso especial: si es fuera de horario por ser tarde (>= horaCierre)
            if (hF >= horaCierre) {
                console.log(`[TimeValidator] Requested time is after closing. Suggesting tomorrow.`)
                sugerencia_fecha = 'mañana'
                siguiente = this.formatHora24(horaApertura, 0)
            } else if (hF < horaApertura) {
                console.log(`[TimeValidator] Requested time is before opening. Suggesting today opening.`)
                sugerencia_fecha = 'hoy'
                siguiente = this.formatHora24(horaApertura, 0)
            } else {
                // Buscar siguiente bloque válido HOY
                let tempH = hF
                let tempM = mF
                let found = false
                console.log(`[TimeValidator] Searching next block today starting from ${hF}:${mF}`)
                
                for (let i = 0; i < 48; i++) {
                    const next = this.siguienteBloque(tempH, tempM)
                    const nextMin = next.h * 60 + next.m
                    
                    console.log(`[TimeValidator] i=${i}, Checking block ${next.h}:${next.m} (nextMin: ${nextMin})`)

                    // Si el siguiente bloque es IGUAL O MAYOR al cierre, ya no hay lugar hoy
                    if (next.h >= horaCierre) {
                        console.log(`[TimeValidator] Block ${next.h}:${next.m} reaches closing time (${horaCierre}). Moving to tomorrow.`)
                        sugerencia_fecha = 'mañana'
                        siguiente = this.formatHora24(horaApertura, 0)
                        found = true
                        break
                    }

                    if (nextMin - actualMin >= 15) {
                        console.log(`[TimeValidator] Found valid block today: ${next.h}:${next.m}`)
                        siguiente = this.formatHora24(next.h, next.m)
                        found = true
                        break
                    }
                    tempH = next.h
                    tempM = next.m
                }
                
                if (!found) {
                    console.log(`[TimeValidator] No valid block found today. Suggesting tomorrow.`)
                    sugerencia_fecha = 'mañana'
                    siguiente = this.formatHora24(horaApertura, 0)
                }
            }
        }

        const out: TimeValidatorOutput = {
            status,
            motivo,
            advertencia,
            ajustada,
            hora_solicitada_24h: this.formatHora24(hF, mF),
            sugerencia_fecha,
            siguiente_bloque: siguiente,
            siguiente_bloque_12h: siguiente
                ? this.formatHora12(parseInt(siguiente.split(':')[0]), parseInt(siguiente.split(':')[1]))
                : null
        }
        console.log('[TimeValidator] FINAL OUTPUT:', out)
        return out

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

        // Heurística de proximidad: si no especifica AM/PM y la hora es 12
        // y la hora actual es antes de mediodía (por ejemplo 11:30 AM),
        // "12" casi siempre significa 12:00 PM (Mediodía) de HOY.
        // Si h es 1-10, mantenemos AM.
        if (!pm && !am && h >= 1 && h <= 12) {
            // Mantener como AM/Mediodía
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

    private static esHoraValidaEnHorario(hSolicitada: number, mSolicitada: number, actualMin: number): boolean {
        const solicitadaMin = hSolicitada * 60 + mSolicitada

        if (actualMin >= this.HORA_APERTURA * 60 && actualMin < this.HORA_CIERRE * 60) {
            return solicitadaMin >= actualMin && solicitadaMin < this.HORA_CIERRE * 60
        }

        if (actualMin >= this.HORA_CIERRE * 60) {
            return solicitadaMin >= this.HORA_APERTURA * 60
        }

        return solicitadaMin >= this.HORA_APERTURA * 60 && solicitadaMin < this.HORA_CIERRE * 60
    }
}
