-- ============================================================================
-- Migration: 016_reminder_settings
-- ============================================================================

-- Add reminder configuration columns to 'sucursales'
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS recordatorios_activos BOOLEAN DEFAULT false;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS minutos_antes_recordatorio INTEGER DEFAULT 15;
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS minutos_tardanza_mensaje INTEGER DEFAULT 15;

-- Comment on columns for documentation
COMMENT ON COLUMN sucursales.recordatorios_activos IS 'Habilita o deshabilita los recordatorios automáticos para esta sucursal';
COMMENT ON COLUMN sucursales.minutos_antes_recordatorio IS 'Minutos antes de la cita para enviar el recordatorio';
COMMENT ON COLUMN sucursales.minutos_tardanza_mensaje IS 'Minutos después de la hora de la cita para enviar mensaje si el cliente no ha llegado (si aplica)';
