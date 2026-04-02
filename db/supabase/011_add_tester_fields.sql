-- ============================================================================
-- Migration: 011_add_tester_fields
-- ============================================================================

ALTER TABLE ia_request_logs ADD COLUMN IF NOT EXISTS session_name TEXT;
ALTER TABLE ia_request_logs ADD COLUMN IF NOT EXISTS tester_session BOOLEAN DEFAULT false;
ALTER TABLE ia_request_logs ADD COLUMN IF NOT EXISTS messages JSONB DEFAULT '[]'::jsonb;
