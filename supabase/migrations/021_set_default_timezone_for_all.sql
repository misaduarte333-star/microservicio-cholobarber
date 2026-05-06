-- ============================================================================
-- Migration: 021_set_default_timezone_for_all
-- ============================================================================

UPDATE sucursales 
SET timezone = 'America/Hermosillo' 
WHERE timezone IS NULL OR timezone = '';

-- También nos aseguramos de que el default sea ese para futuras sucursales
ALTER TABLE sucursales 
ALTER COLUMN timezone SET DEFAULT 'America/Hermosillo';
