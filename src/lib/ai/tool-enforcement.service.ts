/**
 * ============================================================================
 * TOOL ENFORCEMENT MIDDLEWARE
 * ============================================================================
 * Valida que el agente esté usando las herramientas correctas basado en 
 * los triggers detectados en el input del usuario.
 * 
 * Si el agente intenta responder sin llamar las herramientas requeridas,
 * este middleware lo rechaza y fuerza al LLM a iterar de nuevo.
 */

import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { InputValidationResult } from './input-validator.service'

export interface EnforcementContext {
    userInput: string
    triggerValidation: InputValidationResult
    maxRetries?: number
}

export interface EnforcementResult {
    compliant: boolean
    missingTools: string[]
    shouldRetry: boolean
    retryInstruction?: string
    passThrough: boolean // true si pasa el enforcement
}

/**
 * Valida la respuesta del agente contra los triggers requeridos
 */
export function enforceToolCompliance(
    agentResponse: any,
    context: EnforcementContext,
    attemptNumber: number = 1
): EnforcementResult {
    const maxRetries = context.maxRetries || 3
    const triggers = context.triggerValidation
    
    // Extraer las herramientas que el agente usó
    const toolsUsed = new Set<string>()
    const toolsNotUsed: string[] = []
    let hadToolCalls = false

    if (Array.isArray(agentResponse?.messages)) {
        for (const msg of agentResponse.messages) {
            if (msg._getType?.() === 'ai') {
                const toolCalls = (msg as any).tool_calls
                if (toolCalls && toolCalls.length > 0) {
                    hadToolCalls = true
                    for (const tc of toolCalls) {
                        toolsUsed.add(tc.name)
                    }
                }
            }
        }
    }

    // Validar que se hayan usado las herramientas requeridas
    const requiredTools: string[] = []
    
    if (triggers.requiresTimeValidation) {
        requiredTools.push('VALIDAR_HORA')
    }
    if (triggers.requiresAvailabilityCheck) {
        requiredTools.push('DISPONIBILIDAD_HOY')
    }
    if (triggers.requiresBarberList) {
        requiredTools.push('Consultar_Barberos')
    }
    if (triggers.requiresClientLookup) {
        requiredTools.push('BUSCAR_CLIENTE')
    }

    // Verificar si se usaron las herramientas requeridas
    for (const required of requiredTools) {
        if (!toolsUsed.has(required)) {
            // Excepciones donde no es crítico
            if (required === 'DISPONIBILIDAD_HOY' && toolsUsed.has('DISPONIBILIDAD_OTRO_DÍA')) {
                continue // OK, se usó alternativa
            }
            toolsNotUsed.push(required)
        }
    }

    // Si no hay herramientas requeridas, permitir paso
    if (requiredTools.length === 0) {
        return {
            compliant: true,
            missingTools: [],
            shouldRetry: false,
            passThrough: true
        }
    }

    // Si se usaron todas las herramientas requeridas, permitir paso
    if (toolsNotUsed.length === 0) {
        return {
            compliant: true,
            missingTools: [],
            shouldRetry: false,
            passThrough: true
        }
    }

    // Si faltaron herramientas requeridas y es el primer intento, reintentar
    if (attemptNumber < maxRetries) {
        return {
            compliant: false,
            missingTools: toolsNotUsed,
            shouldRetry: true,
            passThrough: false,
            retryInstruction: buildRetryInstruction(toolsNotUsed, triggers, context.userInput, attemptNumber, maxRetries)
        }
    }

    // Si ya se llegó al máximo de reintentos, permitir paso con advertencia
    return {
        compliant: false,
        missingTools: toolsNotUsed,
        shouldRetry: false,
        passThrough: true // Dejar pasar con advertencia en logs
    }
}

/**
 * Construye la instrucción de reintentp para el LLM
 */
function buildRetryInstruction(
    missingTools: string[],
    triggers: InputValidationResult,
    userInput: string,
    attemptNumber: number,
    maxRetries: number
): string {
    const toolList = missingTools.join(', ')
    const attempt = `${attemptNumber}/${maxRetries}`
    
    let instruction = `\n[ENFORCEMENT RETRY ${attempt}] Validación fallida. No llamaste a: ${toolList}\n\n`
    
    if (triggers.requiresTimeValidation && missingTools.includes('VALIDAR_HORA')) {
        instruction += `El usuario mencionó una hora ("${triggers.timePattern}"), DEBES llamar VALIDAR_HORA PRIMERO antes de responder sobre disponibilidad.\n\n`
    }
    
    if (triggers.requiresAvailabilityCheck && 
        (missingTools.includes('DISPONIBILIDAD_HOY') || missingTools.includes('DISPONIBILIDAD_OTRO_DÍA'))) {
        instruction += `El usuario pregunta sobre disponibilidad. DEBES llamar DISPONIBILIDAD_HOY o DISPONIBILIDAD_OTRO_DÍA antes de responder.\n\n`
    }
    
    if (triggers.requiresBarberList && missingTools.includes('Consultar_Barberos')) {
        instruction += `El usuario pregunta sobre profesionales. DEBES llamar Consultar_Barberos para obtener datos reales.\n\n`
    }

    instruction += `Reintentar ahora. Llama PRIMERO las herramientas requeridas, LUEGO responde al usuario.\n`
    instruction += `Input original: "${userInput}"\n`
    
    return instruction
}

/**
 * Valida una respuesta final para detectar alucinaciones
 */
export function validateFinalResponse(
    responseText: string,
    toolsUsed: Set<string>,
    triggers: InputValidationResult
): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    // Si dijo nombres de barberos sin haber llamado CONSULTAR_BARBEROS o DISPONIBILIDAD
    if (triggers.requiresBarberList || triggers.requiresAvailabilityCheck) {
        const barberNames = responseText.match(/\b(Carlos|Angel|Gabriel|Misap|Estilista|Pedicurista)\b/gi) || []
        const hasAvailabilityTool = toolsUsed.has('DISPONIBILIDAD_HOY') || 
                                    toolsUsed.has('DISPONIBILIDAD_OTRO_DÍA') ||
                                    toolsUsed.has('Consultar_Barberos')
        
        if (barberNames.length > 0 && !hasAvailabilityTool) {
            issues.push(`Mencionaste profesionales (${barberNames.join(', ')}) sin verificar disponibilidad real`)
        }
    }

    // Si dijo horarios sin haber llamado VALIDAR_HORA
    if (triggers.requiresTimeValidation && !toolsUsed.has('VALIDAR_HORA')) {
        const hasTimeStatements = /\b(\d{1,2}:?\d{2})\s*(am|pm|a\.m|p\.m)|mediodía|medianoche|mañana|hoy|tarde|noche/i.test(responseText)
        if (hasTimeStatements) {
            issues.push('Hiciste afirmaciones sobre horarios sin haber validado con VALIDAR_HORA')
        }
    }

    return {
        isValid: issues.length === 0,
        issues
    }
}
