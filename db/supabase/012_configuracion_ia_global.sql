-- Migración para configuración global de IA y Evolution
CREATE TABLE IF NOT EXISTS public.configuracion_ia_global (
    id bigint PRIMARY KEY DEFAULT 1,
    evolution_api_url text,
    evolution_api_key text,
    openai_api_key text,
    anthropic_api_key text,
    groq_api_key text,
    default_provider text DEFAULT 'openai',
    openai_model text DEFAULT 'gpt-4o-mini',
    anthropic_model text DEFAULT 'claude-3-5-sonnet-20240620',
    groq_model text DEFAULT 'llama-3.1-70b-versatile',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT only_one_row CHECK (id = 1)
);

-- Habilitar RLS (Seguridad)
ALTER TABLE public.configuracion_ia_global ENABLE ROW LEVEL SECURITY;

-- Insertar configuración inicial con tus credenciales actuales
INSERT INTO public.configuracion_ia_global (
    id, 
    evolution_api_url, 
    evolution_api_key, 
    anthropic_api_key,
    default_provider,
    openai_model
) VALUES (
    1, 
    'https://cholobot-evolution.ada8bf.easypanel.host', 
    '123456.+az1', 
    'REPLACE_WITH_YOUR_ANTHROPIC_KEY',
    'openai',
    'gpt-4o-mini'
) ON CONFLICT (id) DO UPDATE SET
    evolution_api_url = EXCLUDED.evolution_api_url,
    evolution_api_key = EXCLUDED.evolution_api_key,
    anthropic_api_key = EXCLUDED.anthropic_api_key;
