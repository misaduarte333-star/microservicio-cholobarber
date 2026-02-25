-- Add new columns for branch contact and location details
ALTER TABLE sucursales
ADD COLUMN IF NOT EXISTS google_maps_url TEXT,
ADD COLUMN IF NOT EXISTS ubicacion TEXT,
ADD COLUMN IF NOT EXISTS telefono_fijo TEXT,
ADD COLUMN IF NOT EXISTS email_contacto TEXT,
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS zona_ubicacion TEXT;

COMMENT ON COLUMN sucursales.ubicacion IS 'General location description (e.g., Centro Comercial Las Plazas)';
COMMENT ON COLUMN sucursales.zona_ubicacion IS 'Specific zone or area (e.g., Norte, Sur, Centro)';
