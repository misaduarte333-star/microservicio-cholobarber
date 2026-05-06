export interface ConfigIA {
    id: number
    evolution_api_url: string | null
    evolution_api_key: string | null
    openai_api_key: string | null
    anthropic_api_key: string | null
    groq_api_key: string | null
    default_provider: string
    openai_model: string
    anthropic_model: string
    groq_model: string
}
