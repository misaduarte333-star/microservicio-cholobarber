/**
 * ============================================================================
 * INPUT VALIDATOR SERVICE
 * ============================================================================
 * Detecta triggers en la entrada del usuario que REQUIEREN validación con tools
 * antes de que el LLM pueda responder.
 * 
 * Objetivo: Evitar que el agente aluci­ne respuestas basadas en contexto previo
 * sin validar información real contra la base de datos.
 */

export interface InputValidationResult {
    requiresTimeValidation: boolean
    requiresAvailabilityCheck: boolean
    requiresClientLookup: boolean
    requiresBarberList: boolean
    timePattern?: string
    detectedTriggers: string[]
    instruction?: string
}

/**
 * Detecta si el input requiere validación con tools específicas
 */
export function validateInputTriggers(userInput: string): InputValidationResult {
    const lowerInput = userInput.toLowerCase().trim()
    const triggers: string[] = []
    
    const result: InputValidationResult = {
        requiresTimeValidation: false,
        requiresAvailabilityCheck: false,
        requiresClientLookup: false,
        requiresBarberList: false,
        detectedTriggers: []
    }

    // ========================================================================
    // PATRONES DE TIEMPO (CRÍTICO)
    // ========================================================================
    const timePatterns = [
        /a las?\s+(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m|p\.m)?/gi,
        /a las?\s+(diez|once|doce|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|quince|veinte)\s*(am|pm)?/gi,
        /(mañana|hoy|hoy en la (tarde|noche|mañana))\s+a\s+las?\s+\d{1,2}/gi,
        /(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m|p\.m|horas)/gi,
        /(de|a)\s+la (mañana|tarde|noche)/gi,
        /media?no/gi,
        /mediodía/gi,
        /al\s+(rato|rato|media\s+hora)/gi,
    ]

    let foundTime = false
    for (const pattern of timePatterns) {
        if (pattern.test(lowerInput)) {
            foundTime = true
            result.timePattern = lowerInput.match(pattern)?.[0] || 'tiempo indefinido'
            result.requiresTimeValidation = true
            result.requiresAvailabilityCheck = true
            triggers.push('TIME_MENTION')
            break
        }
    }

    // ========================================================================
    // TRIGGERS DE AGENDAMIENTO Y DISPONIBILIDAD
    // ========================================================================
    const schedulingPatterns = [
        /agend(a|ar|ar me)/gi,
        /quiero (una cita|cita|reserva)/gi,
        /reserve?/gi,
        /dime.*disponib/gi,
        /hay (lugar|espacio|disponib)/gi,
        /cuando es (tu proxima|la próxima)/gi,
        /primero.*disponible/gi,
        /proxim.*disponib/gi,
    ]

    for (const pattern of schedulingPatterns) {
        if (pattern.test(lowerInput)) {
            result.requiresAvailabilityCheck = true
            result.requiresTimeValidation = true // Siempre validar hora si hay agendamiento
            triggers.push('SCHEDULING_REQUEST')
            break
        }
    }

    // ========================================================================
    // TRIGGERS DE CONFIRMACIÓN (Usuario acepta algo y necesita validar disponibilidad)
    // ========================================================================
    const confirmationPatterns = [
        /^(si|sí|ok|okay|dale|bueno|está bien|de acuerdo|perfecto|excelente|claro|ándale)$/gi,
        /^(si|sí|ok|dale|bueno),?\s*(agend|cita|reserva)/gi,
    ]

    let isConfirmation = false
    for (const pattern of confirmationPatterns) {
        if (pattern.test(lowerInput)) {
            isConfirmation = true
            triggers.push('USER_CONFIRMATION')
            // Si el usuario confirma, probablemente necesita validar disponibilidad de barberos
            result.requiresAvailabilityCheck = true
            break
        }
    }

    // ========================================================================
    // TRIGGERS DE BARBEROS
    // ========================================================================
    const barberPatterns = [
        /quien est.*dispon/gi,
        /cual.*barbero/gi,
        /que barbero/gi,
        /con (quien|cual|que)\s+(barbero|estilista|pedicurista)/gi,
        /barberos? dispon/gi,
        /me importa.*quien\s+(sea|sea)/gi,
    ]

    for (const pattern of barberPatterns) {
        if (pattern.test(lowerInput)) {
            result.requiresBarberList = true
            if (foundTime) result.requiresAvailabilityCheck = true // Si pregunta por barbero + hora → check availability
            triggers.push('BARBER_REQUEST')
            break
        }
    }

    // ========================================================================
    // TRIGGERS DE CLIENTE
    // ========================================================================
    const clientPatterns = [
        /mi nombre es/gi,
        /me llamo/gi,
        /soy.+[a-z]/gi,
        /mis citas/gi,
        /tengo (una cita|cita|reserva)/gi,
    ]

    for (const pattern of clientPatterns) {
        if (pattern.test(lowerInput)) {
            result.requiresClientLookup = true
            triggers.push('CLIENT_CONTEXT')
            break
        }
    }

    result.detectedTriggers = [...new Set(triggers)] // Eliminar duplicados

    // ========================================================================
    // INSTRUCCIÓN PARA EL AGENTE
    // ========================================================================
    if (result.requiresTimeValidation) {
        result.instruction = 
            'ALERTA CRÍTICA: El usuario mencionó una hora. ' +
            'DEBES llamar VALIDAR_HORA INMEDIATAMENTE antes de responder cualquier cosa sobre disponibilidad. ' +
            'NO ADIVINES si la hora es válida.'
    } else if (result.requiresAvailabilityCheck) {
        result.instruction = 
            'ALERTA: El usuario pregunta sobre disponibilidad. ' +
            'DEBES consultar DISPONIBILIDAD_HOY o DISPONIBILIDAD_OTRO_DÍA con datos reales de la BD. ' +
            'NO consultes tu contexto previo de otras conversaciones.'
    } else if (result.requiresBarberList) {
        result.instruction = 
            'ALERTA: El usuario pregunta sobre barberos. ' +
            'Consulta CONSULTAR_BARBEROS para obtener la lista real de profesionales activos.'
    }

    return result
}

/**
 * Valida que el LLM haya usado las herramientas correctas basado en los triggers detectados
 */
export function validateToolCompliance(
    triggers: InputValidationResult,
    llmResponse: any
): { compliant: boolean; missingTools: string[]; reason?: string } {
    const missingTools: string[] = []
    let compliant = true

    // Extraer las herramientas que el LLM realmente usó
    const toolsUsed = new Set<string>()
    
    if (Array.isArray(llmResponse?.messages)) {
        for (const msg of llmResponse.messages) {
            if (msg._getType?.() === 'ai' && msg.tool_calls) {
                for (const tc of msg.tool_calls) {
                    toolsUsed.add(tc.name)
                }
            }
        }
    }

    // Validar que se hayan usado las herramientas requeridas
    if (triggers.requiresTimeValidation && !toolsUsed.has('VALIDAR_HORA')) {
        missingTools.push('VALIDAR_HORA')
        compliant = false
    }

    if (triggers.requiresAvailabilityCheck && 
        !toolsUsed.has('DISPONIBILIDAD_HOY') && 
        !toolsUsed.has('DISPONIBILIDAD_OTRO_DÍA')) {
        missingTools.push('DISPONIBILIDAD_HOY o DISPONIBILIDAD_OTRO_DÍA')
        compliant = false
    }

    if (triggers.requiresBarberList && !toolsUsed.has('Consultar_Barberos')) {
        missingTools.push('Consultar_Barberos')
        compliant = false
    }

    if (triggers.requiresClientLookup && !toolsUsed.has('BUSCAR_CLIENTE')) {
        missingTools.push('BUSCAR_CLIENTE')
        compliant = false
    }

    return {
        compliant,
        missingTools,
        reason: missingTools.length > 0 
            ? `Faltaron estas herramientas: ${missingTools.join(', ')}. El agente no validó información real.`
            : undefined
    }
}
