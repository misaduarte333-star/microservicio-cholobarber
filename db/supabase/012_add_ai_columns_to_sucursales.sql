-- ============================================================================
-- Migration: 012_add_all_missing_columns_to_sucursales
-- ============================================================================

-- Plan and slug (from migration 007)
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'basico';
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS slug TEXT;

-- AI Agent configuration columns
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN DEFAULT true;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS agent_name TEXT;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS agent_personality TEXT;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS agent_instance_name TEXT;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS agent_evolution_key TEXT;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS agent_custom_prompt TEXT;

-- LLM configuration columns
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS llm_provider TEXT DEFAULT 'openai';
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS llm_model TEXT;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS llm_api_key TEXT;

-- Evolution API key
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS evolution_key TEXT;
