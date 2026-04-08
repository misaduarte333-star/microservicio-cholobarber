-- ============================================================================
-- Migration 012: Add updated_at to sucursales
-- ============================================================================

-- 1. Añadir la columna updated_at si no existe
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Asegurar que los registros existentes tengan el valor de created_at si updated_at es nulo
UPDATE sucursales SET updated_at = created_at WHERE updated_at IS NULL;

-- 3. Crear el trigger para actualización automática
-- El nombre de la función 'update_updated_at_column' fue definido en la migración 001.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sucursales_updated_at') THEN
        CREATE TRIGGER update_sucursales_updated_at
            BEFORE UPDATE ON sucursales
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
