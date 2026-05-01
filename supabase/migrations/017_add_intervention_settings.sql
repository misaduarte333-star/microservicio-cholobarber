-- Migration to add intervention pause settings to sucursales
ALTER TABLE sucursales 
ADD COLUMN IF NOT EXISTS intervention_pause_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS intervention_pause_duration INTEGER DEFAULT 60;

COMMENT ON COLUMN sucursales.intervention_pause_enabled IS 'Indica si el agente se debe pausar automáticamente cuando el humano interviene.';
COMMENT ON COLUMN sucursales.intervention_pause_duration IS 'Duración de la pausa automática en minutos.';
