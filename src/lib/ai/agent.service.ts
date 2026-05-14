import { ChatOpenAI } from '@langchain/openai'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

import { buildSystemPrompt } from './prompts'
import { makeAllTools } from './tools'
import { normalizePhone } from './tools/appointment.tools'
import { getAISupabaseClient } from './tools/business.tools'
import { MemoryService } from './memory.service'
import { MetricsService } from './metrics.service'
import { CatalogCacheService } from './catalog-cache.service'
import { validateInputTriggers } from './input-validator.service'
import { enforceToolCompliance, validateFinalResponse } from './tool-enforcement.service'

export interface AgentContext {
    sucursalId: string
    nombre: string
    agentName: string
    personality: string
    greeting?: string | null
    timezone: string
    customPrompt?: string | null
    tipoPrestador?: string       // 'barbero' | 'estilista' | 'pedicurista' | etc.
    tipoPrestadorLabel?: string  // Etiqueta legible: 'Barbero', 'Estilista', etc.
    agentTimeoutMs?: number
    // Multi Provider support
    aiProvider: 'openai' | 'anthropic' | 'groq'
    aiModel: string
    openaiKey: string
    anthropicKey?: string | null
    groqKey?: string | null
    // Webhook Context
    evoToken?: string
    evoEndpoint?: string
    apiBase?: string
    instanceName?: string
    presenceInstance?: string
}

export interface AgentStep {
    type: 'thinking' | 'tool_call' | 'tool_result' | 'response'
    name?: string
    input?: any
    output?: any
    timestamp: number
    hasError?: boolean
    databaseInteraction?: string | string[]
}

export interface AgentRunResult {
    response: string
    steps: AgentStep[]
    systemPrompt?: string
    promptUpdatedAt?: string
}

export class AgentService {
    public static async run(
        sessionId: string,
        input: string,
        senderPhone: string,
        ctx: AgentContext
    ): Promise<AgentRunResult> {
        
        // 1. Instanciar herramientas aisladas para esta sucursal
        const tools = makeAllTools(ctx.sucursalId, ctx.timezone)

        // 2. Pre-cargar datos estáticos del negocio (barberos, servicios, sucursal) + Cliente
        const supabase = getAISupabaseClient()
        const phoneNormalized = normalizePhone(senderPhone)

        let sucursalRes, clienteRes, businessCatalogStr, barberosRes
        try {
            [sucursalRes, clienteRes, businessCatalogStr, barberosRes] = await Promise.all([
                supabase.from('sucursales').select('nombre, direccion, telefono_whatsapp, horario_apertura, created_at, updated_at')
                    .eq('id', ctx.sucursalId).single(),
                supabase.from('clientes').select('id, nombre').eq('telefono', phoneNormalized).limit(1).maybeSingle(),
                CatalogCacheService.getCatalogContext(ctx.sucursalId, ctx.tipoPrestadorLabel || 'Barbero'),
                supabase.from('barberos').select('nombre').eq('sucursal_id', ctx.sucursalId).eq('activo', true)
            ])

            if (sucursalRes.error) throw new Error(`Error sucursal data: ${sucursalRes.error.message}`)

        } catch (dbError: any) {
            console.error('[AgentService] DB Loading Error:', dbError.message)
            throw new Error(`Error en base de datos al cargar contexto: ${dbError.message}`)
        }

        // 3. Construir Prompt del Sistema con datos mínimos
        const systemPromptStr = buildSystemPrompt({
            nombre: ctx.nombre,
            agentName: ctx.agentName,
            personality: ctx.personality,
            timezone: ctx.timezone,
            customPrompt: ctx.customPrompt || undefined,
            identifiedClient: clienteRes?.data || undefined,
            clientNotFound: !clienteRes?.data,
            businessCatalog: businessCatalogStr,
            tipoPrestadorLabel: ctx.tipoPrestadorLabel || 'Barbero',
            horarioApertura: sucursalRes?.data?.horario_apertura
        })
        console.log(`[AgentService] Context loaded. Provider: ${ctx.aiProvider} | Model: ${ctx.aiModel}`)
        console.log(`[AgentService] System Prompt Length: ${systemPromptStr.length} chars`)

        // 3. Crear LLM dinámico según el proveedor configurado
        const MAX_OUTPUT_TOKENS = 500
        const LLM_TIMEOUT_MS = 30000

        let llm: any

        if (ctx.aiProvider === 'anthropic' && ctx.anthropicKey) {
            const { ChatAnthropic } = await import('@langchain/anthropic')
            llm = new ChatAnthropic({
                anthropicApiKey: ctx.anthropicKey,
                modelName: ctx.aiModel,
                temperature: 0,
                maxTokens: MAX_OUTPUT_TOKENS,
                maxRetries: 2
            })
        } else if (ctx.aiProvider === 'groq' && ctx.groqKey) {
            const { ChatGroq } = await import('@langchain/groq')
            llm = new ChatGroq({
                apiKey: ctx.groqKey,
                model: ctx.aiModel,
                temperature: 0,
                maxTokens: MAX_OUTPUT_TOKENS,
                timeout: LLM_TIMEOUT_MS,
                maxRetries: 2
            })
        } else {
            const { ChatOpenAI } = await import('@langchain/openai')
            llm = new ChatOpenAI({
                openAIApiKey: ctx.openaiKey,
                modelName: ctx.aiModel,
                temperature: 0,
                maxTokens: MAX_OUTPUT_TOKENS,
                timeout: LLM_TIMEOUT_MS,
                maxRetries: 2
            })
        }

        // 4. Recuperar historial de chat previo
        const chatHistory = await MemoryService.getChatHistory(sessionId, ctx.timezone)
        const previousMessages = await chatHistory.getMessages()

        // 4.5 VALIDAR TRIGGERS DE INPUT (Detectar qué tools se necesitan)
        const inputValidation = validateInputTriggers(input)
        console.log(`\n[INPUT VALIDATION] Triggers detected:`, inputValidation.detectedTriggers)
        console.log(`[INPUT VALIDATION] Requires:`, {
            timeValidation: inputValidation.requiresTimeValidation,
            availabilityCheck: inputValidation.requiresAvailabilityCheck,
            barberList: inputValidation.requiresBarberList,
            clientLookup: inputValidation.requiresClientLookup
        })
        if (inputValidation.instruction) {
            console.log(`[INPUT VALIDATION] Instruction for agent:`, inputValidation.instruction)
        }

        // 5. Armar el agente reactivo con LangGraph
        const agent = createReactAgent({
            llm,
            tools,
        })

        try {
            const startTimestamp = Date.now()
            const formatter = new Intl.DateTimeFormat('es-MX', { timeZone: ctx.timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
            const timeFormatter = new Intl.DateTimeFormat('es-MX', { timeZone: ctx.timezone, hour: '2-digit', minute: '2-digit', hour12: false })

            const currentDate = new Date().toLocaleDateString('en-CA', { timeZone: ctx.timezone }) // YYYY-MM-DD
            const currentTime = timeFormatter.format(new Date())

            // Inyectar las variables de runtime al system prompt
            const finalSystemPrompt = systemPromptStr
                .replace(/{current_date}/g, currentDate)
                .replace(/{current_time}/g, currentTime)
                .replace(/{sender_phone}/g, senderPhone)

            // 6. Ejecutar el grafo con el historial previo
            const messages = [
                new SystemMessage(finalSystemPrompt),
                ...previousMessages.slice(-10), // Limit history to last 10 messages
                new HumanMessage(input),
            ]

            console.log('\n--- [AgentService] INVOKING AGENT ---')
            console.log(`Prompt Preview:\n${finalSystemPrompt.substring(0, 500)}...`)
            console.log(`\nInput: "${input}"`)
            console.log(`Custom Prompt found: ${ctx.customPrompt ? 'YES' : 'NO'}`)
            if (ctx.customPrompt) console.log(`Custom Prompt Content:\n${ctx.customPrompt}`)

            let result = await agent.invoke(
                { messages: messages },
                { recursionLimit: 12 } // Límite reducido para evitar costos altos si el modelo entra en loop
            )

            // 6.5 VALIDAR COMPLIANCE DE TOOLS (Enforcement) - MODO ESTRICTO
            let enforcementCheck = enforceToolCompliance(result, {
                userInput: input,
                triggerValidation: inputValidation,
                maxRetries: 2
            }, 1)
            
            // Si falla el compliance y se recomienda reintentar
            if (!enforcementCheck.compliant && enforcementCheck.shouldRetry && enforcementCheck.retryInstruction) {
                console.log(`[TOOL ENFORCEMENT] 🔄 Forzando reintento del agente para usar tools requeridas...`)
                
                const retryMessage = new HumanMessage(enforcementCheck.retryInstruction)

                // Re-invocar agente añadiendo el mensaje de retry
                result = await agent.invoke({
                    messages: [...result.messages, retryMessage]
                }, {
                    recursionLimit: 12
                })
                
                // Segunda validación
                enforcementCheck = enforceToolCompliance(result, {
                    userInput: input,
                    triggerValidation: inputValidation,
                    maxRetries: 2
                }, 2)
            }
            
            let hasComplianceViolation = false
            if (!enforcementCheck.compliant) {
                console.warn(`[TOOL ENFORCEMENT] ⚠️ VIOLATION: Missing tools:`, enforcementCheck.missingTools)
                
                // Detectar si es una violación CRÍTICA
                const criticalMissing = enforcementCheck.missingTools.filter(tool => 
                    // Herramientas críticas que NUNCA deben faltar si hay triggers
                    (tool === 'DISPONIBILIDAD_HOY' && (inputValidation.requiresAvailabilityCheck || inputValidation.detectedTriggers.includes('USER_CONFIRMATION'))) ||
                    (tool === 'VALIDAR_HORA' && inputValidation.requiresTimeValidation)
                )
                
                if (criticalMissing.length > 0) {
                    hasComplianceViolation = true
                    console.error(`[TOOL ENFORCEMENT] 🚨 CRITICAL VIOLATION: Faltaron tools críticas:`, criticalMissing)
                    console.error(`[TOOL ENFORCEMENT] Triggers detectados:`, inputValidation.detectedTriggers)
                }
            }

            // 7. Extraer la última respuesta y los pasos del agente
            // Priorizamos el último mensaje de la IA que NO sea una llamada a herramientas
            const aiMessages = result.messages.filter((m: any) => m._getType?.() === 'ai')
            const lastAIMessage = aiMessages[aiMessages.length - 1]
            
            let outputText = ''
            if (lastAIMessage) {
                const raw = lastAIMessage.content
                outputText = (Array.isArray(raw)
                    ? raw.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
                    : String(raw)).trim()
                
                // Si el último mensaje tiene tool_calls, el LLM se detuvo antes de dar la respuesta final.
                // Intentamos buscar un mensaje anterior que sí tenga texto, o avisamos del error.
                if ((lastAIMessage as any).tool_calls?.length > 0) {
                   outputText = "Disculpa, me quedé a medias procesando tu solicitud. ¿Podrías repetirme qué necesitas?"
                }
            }

            // 7.5 APLICAR CORRECCIONES POR COMPLIANCE VIOLATION (Si hay violación crítica)
            if (hasComplianceViolation && inputValidation.detectedTriggers.includes('USER_CONFIRMATION')) {
                // El usuario confirmó pero no se validó disponibilidad
                // Reemplazar respuesta con una que fuerce validación
                console.log(`[TOOL ENFORCEMENT] 🔄 Interceptando respuesta para forzar validación...`)
                outputText = `Espera, estoy verificando disponibilidad en tiempo real... Un momento.`
            }

            // 7b. Recopilar pasos del agente para el panel de debug
            const steps: AgentStep[] = []
            const toolInputs: Record<string, any> = {}
            let dbInteraction: string | string[] | undefined = undefined

            for (const msg of result.messages) {
                const msgType = msg._getType?.()
                if (msgType === 'ai') {
                    // Check for tool calls
                    const toolCalls = (msg as any).tool_calls
                    if (toolCalls && toolCalls.length > 0) {
                        for (const tc of toolCalls) {
                            console.log(`[AgentService] TOOL CALL DETECTED: ${tc.name}`, tc.args)
                            if (tc.id) toolInputs[tc.id] = tc.args

                            steps.push({
                                type: 'tool_call',
                                name: tc.name,
                                input: tc.args,
                                timestamp: Date.now()
                            })
                        }
                    } else if (msg === lastAIMessage) {
                        steps.push({
                            type: 'response',
                            output: outputText,
                            timestamp: Date.now()
                        })
                    }
                } else if (msgType === 'tool') {
                    let parsedContent: any
                    let hasError = false
                    const rawContent = String(msg.content)
                    try {
                        parsedContent = JSON.parse(rawContent)
                        hasError = !!(parsedContent.error || parsedContent.status === 'error' || parsedContent.status === 'error_tecnico_db' || parsedContent.error_code)
                        
                        // Extraer metadatos de base de datos si existen
                        if (parsedContent._databaseInteraction) {
                            dbInteraction = parsedContent._databaseInteraction
                            delete parsedContent._databaseInteraction
                            // Actualizar el contenido del mensaje original para que el LLM no vea los metadatos
                            msg.content = JSON.stringify(parsedContent)
                        }
                    } catch {
                        parsedContent = rawContent.substring(0, 1000)
                        hasError = rawContent.toLowerCase().startsWith('error')
                    }
                    const toolCallId = (msg as any).tool_call_id
                    steps.push({
                        type: 'tool_result',
                        name: (msg as any).name ?? 'unknown',
                        input: toolCallId ? toolInputs[toolCallId] : undefined,
                        output: parsedContent,
                        timestamp: Date.now(),
                        hasError,
                        databaseInteraction: dbInteraction
                    })
                }
            }

            // 8. Guardar el intercambio en el historial de Postgres
            await chatHistory.addUserMessage(input)
            await chatHistory.addAIMessage(outputText)

            // 8.5 VALIDAR RESPUESTA FINAL (Detectar alucinaciones)
            const toolsUsed = new Set<string>()
            for (const msg of result.messages) {
                if (msg._getType?.() === 'ai') {
                    const toolCalls = (msg as any).tool_calls
                    if (toolCalls && toolCalls.length > 0) {
                        for (const tc of toolCalls) {
                            toolsUsed.add(tc.name)
                        }
                    }
                }
            }
            const knownBarberNames = (barberosRes?.data || []).map((b: any) => b.nombre)
            const finalResponseValidation = validateFinalResponse(outputText, toolsUsed, inputValidation, knownBarberNames)
            if (!finalResponseValidation.isValid) {
                console.warn(`[RESPONSE VALIDATION] WARNING: Possible hallucinations detected:`, finalResponseValidation.issues)
                // Loguear pero no rechazar - la respuesta ya fue enviada
            }

            // 9. Registrar métricas de latencia y herramientas usadas
            const latencyMs = Date.now() - startTimestamp
            const toolMessages = result.messages.filter((m: any) => m._getType?.() === 'tool')
            
            // Extraer uso de tokens (soporte para LangChain usage_metadata)
            const lastAIMsg = [...result.messages].reverse().find((m: any) => m._getType?.() === 'ai' && m.content)
            const usage = (lastAIMsg as any)?.usage_metadata
            
            // Cálculo rudimentario de costo (ej: gpt-4o-mini)
            let estimatedCost = 0
            if (usage) {
                const promptCost = (usage.input_tokens / 1000000) * 0.15
                const completionCost = (usage.output_tokens / 1000000) * 0.60
                estimatedCost = promptCost + completionCost
            }

            MetricsService.record({
                id: crypto.randomUUID(),
                timestamp: startTimestamp,
                sucursalId: ctx.sucursalId,
                sessionId,
                phone: senderPhone,
                inputPreview: input.substring(0, 1000),
                outputPreview: outputText.substring(0, 1000),
                latencyMs,
                tokensPrompt: usage?.input_tokens,
                tokensCompletion: usage?.output_tokens,
                tokensTotal: usage?.total_tokens,
                cost: estimatedCost,
                toolsUsed: toolMessages.map((m: any) => {
                    const rawContent = String(m.content ?? '')
                    let dbInt = undefined
                    try {
                        const parsed = JSON.parse(rawContent)
                        dbInt = parsed._databaseInteraction
                        if (parsed._databaseInteraction) delete parsed._databaseInteraction
                    } catch {}

                    return {
                        name: m.name ?? 'unknown',
                        input: toolInputs[(m as any).tool_call_id] || {},
                        output: rawContent.substring(0, 500),
                        databaseInteraction: dbInt
                    }
                }),
                source: 'webhook'
            })

            return { 
                response: outputText, 
                steps, 
                systemPrompt: finalSystemPrompt,
                promptUpdatedAt: sucursalRes?.data?.updated_at || sucursalRes?.data?.created_at
            }

        } catch (error: any) {
            console.error('[AgentService] Error:', error)
            throw new Error(`AI Agent Error: ${error.message}`)
        }
    }
}
