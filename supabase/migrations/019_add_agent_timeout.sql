-- Add agent_timeout_ms column to sucursales table
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS agent_timeout_ms INTEGER DEFAULT 3000;

-- Comment for documentation
COMMENT ON COLUMN sucursales.agent_timeout_ms IS 'Tiempo de espera en milisegundos para procesar ráfagas de mensajes del cliente antes de que el agente responda.';
