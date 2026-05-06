-- ============================================================================
-- Migration: 020_add_token_tracking_to_logs
-- ============================================================================

ALTER TABLE ia_request_logs 
ADD COLUMN IF NOT EXISTS tokens_prompt INTEGER,
ADD COLUMN IF NOT EXISTS tokens_completion INTEGER,
ADD COLUMN IF NOT EXISTS tokens_total INTEGER,
ADD COLUMN IF NOT EXISTS cost NUMERIC(10, 6);

COMMENT ON COLUMN ia_request_logs.cost IS 'Costo estimado en USD';
