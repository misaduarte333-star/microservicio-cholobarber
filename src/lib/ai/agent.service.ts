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

export interface AgentContext {
    sucursalId: string
    nombre: string
    agentName: string
    personality: string
    timezone: string
    customPrompt?: string | null
    tipoPrestador?: string       // 'barbero' | 'estilista' | 'pedicurista' | etc.
    tipoPrestadorLabel?: string  // Etiqueta legible: 'Barbero', 'Estilista', etc.
    // Multi Provider support
    aiProvider: 'openai' | 'anthropic' | 'groq'
    aiModel: string
    openaiKey: string
    anthropicKey?: string | null
    groqKey?: string | null
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

        let sucursalRes, clienteRes, businessCatalogStr
        try {
            [sucursalRes, clienteRes, businessCatalogStr] = await Promise.all([
                supabase.from('sucursales').select('nombre, direccion, telefono_whatsapp, horario_apertura, created_at, updated_at')
                    .eq('id', ctx.sucursalId).single(),
                supabase.from('clientes').select('id, nombre').eq('telefono', phoneNormalized).limit(1).maybeSingle(),
                CatalogCacheService.getCatalogContext(ctx.sucursalId, ctx.tipoPrestadorLabel || 'Barbero')
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
            businessCatalog: businessCatalogStr,
            tipoPrestadorLabel: ctx.tipoPrestadorLabel || 'Barbero'
        })

        // 3. Crear LLM dinámico según el proveedor configurado
        let llm: any

        if (ctx.aiProvider === 'anthropic' && ctx.anthropicKey) {
            const { ChatAnthropic } = await import('@langchain/anthropic')
            llm = new ChatAnthropic({
                anthropicApiKey: ctx.anthropicKey,
                modelName: ctx.aiModel,
                temperature: 0
            })
        } else if (ctx.aiProvider === 'groq' && ctx.groqKey) {
            const { ChatGroq } = await import('@langchain/groq')
            llm = new ChatGroq({
                apiKey: ctx.groqKey,
                model: ctx.aiModel,
                temperature: 0
            })
        } else {
            llm = new ChatOpenAI({
                openAIApiKey: ctx.openaiKey,
                modelName: ctx.aiModel,
                temperature: 0
            })
        }

        // 4. Recuperar historial de chat previo
        const chatHistory = await MemoryService.getChatHistory(sessionId, ctx.timezone)
        const previousMessages = await chatHistory.getMessages()

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
            const result = await agent.invoke({
                messages: [
                    new SystemMessage(finalSystemPrompt),
                    ...previousMessages,
                    new HumanMessage(input),
                ],
            })

            // 7. Extraer la última respuesta y los pasos del agente
            const lastMessage = result.messages[result.messages.length - 1]
            const raw = lastMessage.content
            const outputText: string = (Array.isArray(raw)
                ? raw.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
                : String(raw)).trim()

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
                            if (tc.id) toolInputs[tc.id] = tc.args
                            steps.push({
                                type: 'tool_call',
                                name: tc.name,
                                input: tc.args,
                                timestamp: Date.now()
                            })
                        }
                    } else if (msg === lastMessage) {
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

            // 9. Registrar métricas de latencia y herramientas usadas
            const latencyMs = Date.now() - startTimestamp
            const toolMessages = result.messages.filter((m: any) => m._getType?.() === 'tool')

            MetricsService.record({
                id: crypto.randomUUID(),
                timestamp: startTimestamp,
                sucursalId: ctx.sucursalId,
                sessionId,
                phone: senderPhone,
                inputPreview: input.substring(0, 1000),
                outputPreview: outputText.substring(0, 1000),
                latencyMs,
                toolsUsed: toolMessages.map((m: any) => {
                    const rawContent = String(m.content ?? '')
                    let dbInt = undefined
                    try {
                        const parsed = JSON.parse(rawContent)
                        dbInt = parsed._databaseInteraction
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
