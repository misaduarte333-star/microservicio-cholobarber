-- Migration 008: Add AI agent configuration fields to sucursales
-- Run against your Supabase project SQL editor

ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS agent_name          TEXT DEFAULT 'Asistente',
  ADD COLUMN IF NOT EXISTS agent_personality   TEXT DEFAULT 'friendly',
  -- Values: 'friendly' | 'professional' | 'casual' | 'cholo-friendly' | free text
  ADD COLUMN IF NOT EXISTS agent_greeting      TEXT,
  ADD COLUMN IF NOT EXISTS agent_custom_prompt TEXT,
  ADD COLUMN IF NOT EXISTS evolution_instance  TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS evolution_url       TEXT,
  ADD COLUMN IF NOT EXISTS evolution_key       TEXT,
  ADD COLUMN IF NOT EXISTS llm_provider        TEXT DEFAULT 'openai',
  -- Values: 'openai' | 'anthropic' | 'google'
  ADD COLUMN IF NOT EXISTS llm_model           TEXT,
  ADD COLUMN IF NOT EXISTS llm_api_key         TEXT,
  ADD COLUMN IF NOT EXISTS agent_active        BOOLEAN DEFAULT FALSE;

-- Index for fast lookup from webhook handler
CREATE INDEX IF NOT EXISTS idx_sucursales_evolution_instance
  ON sucursales(evolution_instance)
  WHERE evolution_instance IS NOT NULL;

-- Backfill CholoBarber (id: f07a7640-9d86-499f-a048-24109345787a)
UPDATE sucursales
SET
  agent_name         = 'CholoBot',
  agent_personality  = 'cholo-friendly',
  agent_greeting     = '¡Que onda! Bienvenido a CholoBarber💈. ¿En qué te puedo ayudar?',
  evolution_instance = 'barberia',
  agent_active       = TRUE
WHERE id = 'f07a7640-9d86-499f-a048-24109345787a';
-- Using the UUID directly is the safest way — no accidental matches
